import { describe, expect, it } from "vitest";
import { ManualClock } from "../domain/clock.js";
import { GuessService } from "../domain/guess-service.js";
import { MemoryPlayerRepository } from "../persistence/memory-player-repository.js";
import type { MarketData } from "../prices/price-provider.js";
import type { MarketQuote } from "../domain/rules.js";
import { createApp } from "./app.js";
import { hashToken } from "../auth/tokens.js";

class FakeMarket implements MarketData {
  price = "70000.00";
  fail = false;
  constructor(private readonly clock: ManualClock) {}
  async getQuote(): Promise<MarketQuote> {
    if (this.fail) throw new Error("down");
    return {
      price: this.price,
      observedAt: new Date(this.clock.now()).toISOString(),
      source: "fake",
    };
  }
  getSettlementQuote(): Promise<MarketQuote> {
    return this.getQuote();
  }
}

function build() {
  const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
  const market = new FakeMarket(clock);
  const service = new GuessService(new MemoryPlayerRepository(), market, clock, () => "guess-1", {
    quoteMaxAgeMs: 15_000,
  });
  const app = createApp({
    service,
    clock,
    allowedOrigins: ["http://localhost:5173"],
  });
  return { app, clock, market, service };
}

describe("HTTP API", () => {
  it("creates a player with score zero and does not echo the token hash", async () => {
    const { app } = build();
    const response = await app.request("/api/players", { method: "POST" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.player.score).toBe(0);
    expect(body.token).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(hashToken(body.token));
  });

  it("returns 409 for a second active guess and 400 for a client-supplied price", async () => {
    const { app } = build();
    const created = await (await app.request("/api/players", { method: "POST" })).json();
    const headers = {
      authorization: `Bearer ${created.token}`,
      "content-type": "application/json",
    };
    const first = await app.request("/api/guesses", {
      method: "POST",
      headers,
      body: JSON.stringify({ direction: "UP" }),
    });
    expect(first.status).toBe(201);
    const accepted = await first.json();
    expect(accepted.activeGuess.entryPrice).toBe("70000.00");

    const conflict = await app.request("/api/guesses", {
      method: "POST",
      headers,
      body: JSON.stringify({ direction: "DOWN" }),
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("ACTIVE_GUESS_EXISTS");

    const tampered = await app.request("/api/guesses", {
      method: "POST",
      headers,
      body: JSON.stringify({ direction: "UP", entryPrice: "1" }),
    });
    expect(tampered.status).toBe(400);
  });

  it("returns 503 instead of accepting a guess when the price provider fails", async () => {
    const { app, market } = build();
    const created = await (await app.request("/api/players", { method: "POST" })).json();
    market.fail = true;
    const response = await app.request("/api/guesses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ direction: "DOWN" }),
    });
    expect(response.status).toBe(503);
    const me = await app.request("/api/me", {
      headers: { authorization: `Bearer ${created.token}` },
    });
    expect((await me.json()).activeGuess).toBeNull();
  });

  it("resolves through GET /api/me only after the deadline", async () => {
    const { app, clock, market } = build();
    const created = await (await app.request("/api/players", { method: "POST" })).json();
    const headers = { authorization: `Bearer ${created.token}` };
    await app.request("/api/guesses", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ direction: "UP" }),
    });
    clock.advance(59_000);
    market.price = "80000";
    const early = await app.request("/api/me", { headers });
    expect((await early.json()).score).toBe(0);
    clock.advance(1_000);
    const settled = await app.request("/api/me", { headers });
    const body = await settled.json();
    expect(body.score).toBe(1);
    expect(body.recentGuesses[0].result).toBe("CORRECT");
    const again = await app.request("/api/me", { headers });
    expect((await again.json()).score).toBe(1);
  });

  it("serves health and a public price", async () => {
    const { app } = build();
    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    const price = await app.request("/api/price");
    expect(price.status).toBe(200);
    expect((await price.json()).price).toBe("70000.00");
  });
});
