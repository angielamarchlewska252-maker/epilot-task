import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy, type GetPlatformProxyOptions } from "wrangler";
import { ManualClock } from "../domain/clock.js";
import { GuessService } from "../domain/guess-service.js";
import { PriceUnavailableError } from "../domain/errors.js";
import type { MarketQuote } from "../domain/rules.js";
import { createApp } from "../http/app.js";
import type { MarketData } from "../prices/price-provider.js";
import { D1PlayerRepository, type SqlDatabase } from "./d1-player-repository.js";
import { sqlStatements } from "./sql-script.js";

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

describe("D1PlayerRepository", () => {
  let repository: D1PlayerRepository;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const proxy = await getPlatformProxy({
      configPath: "wrangler.jsonc",
      persist: false,
    } satisfies GetPlatformProxyOptions);
    dispose = proxy.dispose;
    const db = proxy.env.DB as SqlDatabase & { exec(query: string): Promise<unknown> };
    await applyMigration(db);
    repository = new D1PlayerRepository(db);
  }, 30_000);

  afterAll(async () => {
    await dispose();
  });

  it("persists a new player at score zero", async () => {
    await repository.create(player("hash-a"));
    const loaded = await repository.get("hash-a");
    expect(loaded?.score).toBe(0);
    expect(loaded?.activeGuess).toBeNull();
    expect(loaded?.history).toEqual([]);
    const again = await repository.get("hash-a");
    expect(again?.score).toBe(0);
  });

  it("accepts only one of two simultaneous guesses", async () => {
    await repository.create(player("hash-b"));
    const guess = active("g1", "UP");
    const other = active("g2", "DOWN");
    const results = await Promise.all([
      repository.tryActivateGuess("hash-b", guess, guess.createdAt),
      repository.tryActivateGuess("hash-b", other, other.createdAt),
    ]);
    expect(results.filter((result) => result === "ok")).toHaveLength(1);
    expect(results.filter((result) => result === "conflict")).toHaveLength(1);
    const stored = await repository.get("hash-b");
    expect(stored?.activeGuess?.guessId).toMatch(/^g[12]$/);
  });

  it("changes the score once when two settlements race", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const market = new FakeMarket(clock);
    const service = new GuessService(repository, market, clock, () => "guess-race", {
      quoteMaxAgeMs: 15_000,
    });
    await service.createPlayer("hash-race");
    await service.submitGuess("hash-race", "UP");
    clock.advance(60_000);
    market.price = "71000.00";
    const stale = await repository.get("hash-race");
    const results = await Promise.all([
      service.settlePlayer(stale!),
      service.settlePlayer(stale!),
    ]);
    expect(results.filter((result) => result === "resolved")).toHaveLength(1);
    expect((await repository.get("hash-race"))?.score).toBe(1);
    expect((await repository.get("hash-race"))?.activeGuess).toBeNull();
    expect(await service.settlePlayer(stale!)).toBe("pending");
    expect((await repository.get("hash-race"))?.score).toBe(1);
  });

  it("scores each direction only after 60 seconds, and keeps an equal price open", async () => {
    const cases = [
      { pk: "up-win", direction: "UP" as const, next: "71000.00", score: 1, result: "CORRECT" },
      { pk: "up-loss", direction: "UP" as const, next: "69000.00", score: -1, result: "INCORRECT" },
      { pk: "down-win", direction: "DOWN" as const, next: "69000.00", score: 1, result: "CORRECT" },
      { pk: "down-loss", direction: "DOWN" as const, next: "71000.00", score: -1, result: "INCORRECT" },
    ];
    for (const item of cases) {
      const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
      const market = new FakeMarket(clock);
      const service = new GuessService(repository, market, clock, () => `${item.pk}-guess`, {
        quoteMaxAgeMs: 15_000,
      });
      const created = await service.createPlayer(item.pk);
      expect(created.score).toBe(0);
      await service.submitGuess(item.pk, item.direction);
      clock.advance(59_000);
      expect(await service.settlePlayer((await repository.get(item.pk))!)).toBe("pending");
      expect((await repository.get(item.pk))?.score).toBe(0);
      clock.advance(1_000);
      market.price = item.next;
      expect(await service.settlePlayer((await repository.get(item.pk))!)).toBe("resolved");
      const stored = await repository.get(item.pk);
      expect(stored?.score).toBe(item.score);
      expect(stored?.history[0]?.result).toBe(item.result);
      expect(stored?.activeGuess).toBeNull();
    }
  });

  it("leaves the guess pending when the price does not move", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const market = new FakeMarket(clock);
    const service = new GuessService(repository, market, clock, () => "equal-guess", {
      quoteMaxAgeMs: 15_000,
    });
    await service.createPlayer("hash-equal");
    await service.submitGuess("hash-equal", "UP");
    clock.advance(60_000);
    expect(await service.settlePlayer((await repository.get("hash-equal"))!)).toBe("pending");
    const stored = await repository.get("hash-equal");
    expect(stored?.score).toBe(0);
    expect(stored?.activeGuess?.guessId).toBe("equal-guess");
  });

  it("does not open a guess when the price feed is down", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const market = new FakeMarket(clock);
    market.fail = true;
    const service = new GuessService(repository, market, clock, () => "fail-guess", {
      quoteMaxAgeMs: 15_000,
    });
    await service.createPlayer("hash-fail");
    await expect(service.submitGuess("hash-fail", "DOWN")).rejects.toBeInstanceOf(PriceUnavailableError);
    const stored = await repository.get("hash-fail");
    expect(stored?.score).toBe(0);
    expect(stored?.activeGuess).toBeNull();
  });

  it("settles a closed-browser guess from the due list", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T11:00:00.000Z"));
    const market = new FakeMarket(clock);
    const service = new GuessService(repository, market, clock, () => "due-guess", {
      quoteMaxAgeMs: 15_000,
    });
    await service.createPlayer("hash-due");
    await service.submitGuess("hash-due", "DOWN");
    expect(await repository.listDuePlayerIds("2026-10-18T11:00:30.000Z", 25)).not.toContain("hash-due");
    clock.advance(60_000);
    market.price = "69000.00";
    expect(await repository.listDuePlayerIds(new Date(clock.now()).toISOString(), 25)).toContain("hash-due");
    expect(await service.settleDue(25)).toBe(1);
    expect((await repository.get("hash-due"))?.score).toBe(1);
    expect(await service.settleDue(25)).toBe(0);
  });

  it("rejects a second active guess over HTTP and hides the dev price route", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const market = new FakeMarket(clock);
    const service = new GuessService(repository, market, clock, () => "http-guess", {
      quoteMaxAgeMs: 15_000,
    });
    const app = createApp({
      service,
      clock,
      allowedOrigins: ["http://localhost:5173"],
    });
    const created = await (await app.request("/api/players", { method: "POST" })).json();
    expect(created.player.score).toBe(0);
    const headers = {
      authorization: `Bearer ${created.token}`,
      "content-type": "application/json",
    };
    expect(
      (
        await app.request("/api/guesses", {
          method: "POST",
          headers,
          body: JSON.stringify({ direction: "UP" }),
        })
      ).status,
    ).toBe(201);
    const conflict = await app.request("/api/guesses", {
      method: "POST",
      headers,
      body: JSON.stringify({ direction: "DOWN" }),
    });
    expect(conflict.status).toBe(409);
    expect((await app.request("/api/dev/quote", { method: "POST" })).status).toBe(404);
    const me = await (await app.request("/api/me", { headers })).json();
    expect(me.score).toBe(0);
    expect(me.activeGuess.direction).toBe("UP");
  });

  it("trims history to the last 10 guesses", async () => {
    await repository.create(player("hash-trim"));
    for (let index = 0; index < 12; index += 1) {
      const guess = active(`trim-${index}`, "UP");
      expect(await repository.tryActivateGuess("hash-trim", guess, guess.createdAt)).toBe("ok");
      expect(
        await repository.tryResolveGuess(
          "hash-trim",
          guess.guessId,
          {
            guessId: guess.guessId,
            direction: "UP",
            entryPrice: "70000.00",
            settlementPrice: "71000.00",
            createdAt: guess.createdAt,
            eligibleAt: guess.eligibleAt,
            resolvedAt: `2026-10-18T12:02:${String(index).padStart(2, "0")}.000Z`,
            result: "CORRECT",
            scoreDelta: 1,
          },
          1,
          `2026-10-18T12:02:${String(index).padStart(2, "0")}.000Z`,
          10,
        ),
      ).toBe("ok");
    }
    const trimmed = await repository.get("hash-trim");
    expect(trimmed?.history).toHaveLength(10);
    expect(trimmed?.score).toBe(12);
    expect(trimmed?.history[0]?.guessId).toBe("trim-2");
    expect(trimmed?.history.at(-1)?.guessId).toBe("trim-11");
  });
});

async function applyMigration(db: SqlDatabase): Promise<void> {
  const sql = readFileSync("migrations/0001_players.sql", "utf8");
  for (const statement of sqlStatements(sql)) {
    await db.prepare(statement).run();
  }
}

function player(pk: string) {
  return {
    pk,
    score: 0,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
    activeGuess: null,
    history: [],
  };
}

function active(guessId: string, direction: "UP" | "DOWN") {
  return {
    guessId,
    direction,
    entryPrice: "70000.00",
    createdAt: "2026-10-18T12:00:00.000Z",
    eligibleAt: "2026-10-18T12:01:00.000Z",
    status: "PENDING" as const,
  };
}
