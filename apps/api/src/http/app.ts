import {
  devQuoteRequestSchema,
  submitGuessRequestSchema,
} from "@arena/shared";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { hashToken, createPlayerToken } from "../auth/tokens.js";
import type { Clock } from "../domain/clock.js";
import { ActiveGuessError, PlayerNotFoundError, PriceUnavailableError } from "../domain/errors.js";
import type { GuessService } from "../domain/guess-service.js";
import { HttpError } from "./errors.js";

type AppVariables = { tokenHash: string };

export interface AppDependencies {
  service: GuessService;
  clock: Clock;
  allowedOrigins: string[];
  devQuote?: (price: string) => void;
}

export function createApp(deps: AppDependencies) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    "*",
    cors({
      origin: deps.allowedOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof ZodError) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "The request is invalid." } }, 400);
    }
    const mapped = mapServiceError(error);
    if (mapped) {
      return c.json({ error: { code: mapped.code, message: mapped.message } }, mapped.status);
    }
    console.error("request_failed", { name: error instanceof Error ? error.name : "unknown" });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
      500,
    );
  });

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok" as const,
      serverTime: new Date(deps.clock.now()).toISOString(),
    });
  });

  app.post("/api/players", async (c) => {
    const token = createPlayerToken();
    const player = await deps.service.createPlayer(hashToken(token));
    return c.json({ token, player: deps.service.toPlayerState(player) }, 201);
  });

  app.get("/api/me", requirePlayer, async (c) => {
    // Settlement is attempted here because the read is idempotent.
    // The conditional write makes repeated polls change the score once.
    const player = await deps.service.getState(c.get("tokenHash"));
    if (!player) {
      throw new HttpError(401, "UNAUTHORIZED", "Unknown player session.");
    }
    return c.json(deps.service.toPlayerState(player));
  });

  app.get("/api/price", async (c) => {
    try {
      const price = await deps.service.getDisplayPrice();
      return c.json({
        ...price,
        serverTime: new Date(deps.clock.now()).toISOString(),
      });
    } catch (error) {
      if (error instanceof PriceUnavailableError) {
        throw new HttpError(503, "PRICE_UNAVAILABLE", "Market data is temporarily unavailable.");
      }
      throw error;
    }
  });

  app.post("/api/guesses", requirePlayer, async (c) => {
    const body = submitGuessRequestSchema.parse(await readJson(c));
    const player = await deps.service.submitGuess(c.get("tokenHash"), body.direction);
    return c.json(deps.service.toPlayerState(player), 201);
  });

  if (deps.devQuote) {
    app.post("/api/dev/quote", async (c) => {
      const body = devQuoteRequestSchema.parse(await readJson(c));
      deps.devQuote?.(body.price);
      return c.json({ ok: true });
    });
  }

  return app;
}

async function requirePlayer(c: Context<{ Variables: AppVariables }>, next: Next) {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match?.[1]) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing player token.");
  }
  c.set("tokenHash", hashToken(match[1]));
  await next();
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "The request is invalid.");
  }
}

function mapServiceError(
  error: unknown,
): { status: 401 | 409 | 503; code: string; message: string } | null {
  if (error instanceof ActiveGuessError) {
    return { status: 409, code: "ACTIVE_GUESS_EXISTS", message: error.message };
  }
  if (error instanceof PlayerNotFoundError) {
    return { status: 401, code: "UNAUTHORIZED", message: error.message };
  }
  if (error instanceof PriceUnavailableError) {
    return {
      status: 503,
      code: "PRICE_UNAVAILABLE",
      message: "We couldn't read a live Bitcoin price, so the prediction was not accepted.",
    };
  }
  return null;
}
