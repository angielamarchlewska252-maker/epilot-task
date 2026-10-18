import { describe, expect, it } from "vitest";
import { ManualClock } from "./clock.js";
import { ActiveGuessError, PriceUnavailableError } from "./errors.js";
import { GuessService } from "./guess-service.js";
import type { MarketQuote } from "./rules.js";
import { MemoryPlayerRepository } from "../persistence/memory-player-repository.js";
import { PriceProviderError } from "../prices/price-provider.js";
import type { MarketData } from "../prices/price-provider.js";

class FakeMarket implements MarketData {
  price = "70000.00";
  fail = false;
  observedAt: string | null = null;

  constructor(private readonly clock: ManualClock) {}

  async getQuote(): Promise<MarketQuote> {
    if (this.fail) throw new PriceProviderError("down");
    return {
      price: this.price,
      observedAt: this.observedAt ?? new Date(this.clock.now()).toISOString(),
      source: "fake",
    };
  }

  getSettlementQuote(): Promise<MarketQuote> {
    return this.getQuote();
  }
}

function setup() {
  const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
  const market = new FakeMarket(clock);
  const repository = new MemoryPlayerRepository();
  let sequence = 0;
  const service = new GuessService(repository, market, clock, () => `guess-${++sequence}`, {
    quoteMaxAgeMs: 15_000,
  });
  return { clock, market, repository, service };
}

describe("GuessService", () => {
  it("starts a new player at score zero", async () => {
    const { service } = setup();
    const player = await service.createPlayer("player-1");
    expect(player.score).toBe(0);
    expect(player.activeGuess).toBeNull();
    expect(player.history).toEqual([]);
  });

  it("pays +1 for a correct UP guess after 60 seconds", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    clock.advance(60_000);
    market.price = "70000.01";
    const state = await service.getState("player-1");
    expect(state?.score).toBe(1);
    expect(state?.activeGuess).toBeNull();
    expect(state?.history[0]?.result).toBe("CORRECT");
    expect(state?.history[0]?.scoreDelta).toBe(1);
  });

  it("charges 1 for an incorrect UP guess", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    clock.advance(60_000);
    market.price = "69999.99";
    const state = await service.getState("player-1");
    expect(state?.score).toBe(-1);
    expect(state?.history[0]?.result).toBe("INCORRECT");
  });

  it("pays +1 for a correct DOWN guess", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "DOWN");
    clock.advance(60_000);
    market.price = "69000";
    const state = await service.getState("player-1");
    expect(state?.score).toBe(1);
    expect(state?.history[0]?.result).toBe("CORRECT");
  });

  it("charges 1 for an incorrect DOWN guess", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "DOWN");
    clock.advance(60_000);
    market.price = "71000";
    const state = await service.getState("player-1");
    expect(state?.score).toBe(-1);
    expect(state?.history[0]?.result).toBe("INCORRECT");
  });

  it("does not resolve at 59 seconds or at 59999 milliseconds", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    market.price = "80000";
    clock.advance(59_000);
    expect((await service.getState("player-1"))?.activeGuess?.status).toBe("PENDING");
    clock.advance(999);
    expect((await service.getState("player-1"))?.score).toBe(0);
    expect((await service.getState("player-1"))?.activeGuess).not.toBeNull();
  });

  it("resolves at exactly 60 seconds when the price changed", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    const accepted = await service.submitGuess("player-1", "UP");
    expect(accepted.activeGuess?.entryPrice).toBe("70000.00");
    expect(Date.parse(accepted.activeGuess!.eligibleAt) - Date.parse(accepted.activeGuess!.createdAt)).toBe(
      60_000,
    );
    clock.advance(60_000);
    market.price = "70001";
    const state = await service.getState("player-1");
    expect(state?.score).toBe(1);
    expect(state?.history[0]?.settlementPrice).toBe("70001");
  });

  it("keeps the guess pending when the price does not change", async () => {
    const { service, clock } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "DOWN");
    clock.advance(90_000);
    const state = await service.getState("player-1");
    expect(state?.score).toBe(0);
    expect(state?.activeGuess?.status).toBe("PENDING");
  });

  it("rejects a second guess while one is active", async () => {
    const { service } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    await expect(service.submitGuess("player-1", "DOWN")).rejects.toBeInstanceOf(ActiveGuessError);
    const state = await service.getState("player-1");
    expect(state?.activeGuess?.direction).toBe("UP");
  });

  it("allows another guess after settlement", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    clock.advance(60_000);
    market.price = "71000";
    await service.getState("player-1");
    const next = await service.submitGuess("player-1", "DOWN");
    expect(next.activeGuess?.direction).toBe("DOWN");
    expect(next.score).toBe(1);
  });

  it("does not apply the score twice when settlement is repeated", async () => {
    const { service, clock, market, repository } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    clock.advance(60_000);
    market.price = "71000";
    const stale = await repository.get("player-1");
    expect(await service.settlePlayer(stale!)).toBe("resolved");
    expect(await service.settlePlayer(stale!)).toBe("pending");
    expect((await repository.get("player-1"))?.score).toBe(1);
    expect((await service.getState("player-1"))?.score).toBe(1);
  });

  it("creates only one active guess when two submissions race", async () => {
    const { service } = setup();
    await service.createPlayer("player-1");
    const results = await Promise.allSettled([
      service.submitGuess("player-1", "UP"),
      service.submitGuess("player-1", "DOWN"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const state = await service.getState("player-1");
    expect(state?.activeGuess).not.toBeNull();
    expect(state?.score).toBe(0);
  });

  it("does not resolve when the price provider fails or the quote is unusable", async () => {
    const { service, clock, market } = setup();
    await service.createPlayer("player-1");
    await service.submitGuess("player-1", "UP");
    clock.advance(60_000);
    market.fail = true;
    expect((await service.getState("player-1"))?.score).toBe(0);
    expect((await service.getState("player-1"))?.activeGuess).not.toBeNull();

    market.fail = false;
    market.price = "nope";
    expect((await service.getState("player-1"))?.activeGuess?.status).toBe("PENDING");

    market.price = "72000";
    market.observedAt = new Date(clock.now() - 16_000).toISOString();
    expect((await service.getState("player-1"))?.score).toBe(0);
  });

  it("rejects a new guess when the market is unavailable", async () => {
    const { service, market } = setup();
    await service.createPlayer("player-1");
    market.fail = true;
    await expect(service.submitGuess("player-1", "UP")).rejects.toBeInstanceOf(PriceUnavailableError);
    expect((await service.getState("player-1"))?.activeGuess).toBeNull();
  });

  it("restores a saved player and settles due guesses without the browser", async () => {
    const { service, clock, market } = setup();
    const created = await service.createPlayer("player-1");
    expect(created.score).toBe(0);
    await service.submitGuess("player-1", "UP");
    const restored = await service.getState("player-1");
    expect(restored?.activeGuess?.direction).toBe("UP");
    expect(restored?.score).toBe(0);

    clock.advance(60_000);
    market.price = "73000";
    expect(await service.settleDue(10)).toBe(1);
    const view = service.toPlayerState((await service.getState("player-1"))!);
    expect(view.score).toBe(1);
    expect(view.recentGuesses[0]?.guessId).toBe("guess-1");
    expect(view.activeGuess).toBeNull();
  });
});
