import {
  createPlayerResponseSchema,
  playerStateSchema,
  priceResponseSchema,
  type Direction,
  type PlayerState,
  type PriceResponse,
} from "@arena/shared";
import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function baseUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = payload as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      response.status,
      record?.error?.code ?? "REQUEST_FAILED",
      record?.error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return schema.parse(payload);
}

export const api = {
  createPlayer() {
    return request("/api/players", createPlayerResponseSchema, { method: "POST" });
  },
  getMe(token: string) {
    return request("/api/me", playerStateSchema, {
      headers: { authorization: `Bearer ${token}` },
    });
  },
  getPrice() {
    return request("/api/price", priceResponseSchema);
  },
  submitGuess(token: string, direction: Direction): Promise<PlayerState> {
    return request("/api/guesses", playerStateSchema, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ direction }),
    });
  },
};

export type { PlayerState, PriceResponse };
