import { randomUUID } from "node:crypto";
import type { Direction, PlayerState } from "@arena/shared";
import type { Clock } from "./clock.js";
import { ActiveGuessError, PlayerNotFoundError, PriceUnavailableError } from "./errors.js";
import { parsePrice } from "./money.js";
import {
  HISTORY_LIMIT,
  isFreshQuote,
  isPastDeadline,
  quoteCoversDeadline,
  scoreDelta,
  SETTLEMENT_DELAY_MS,
  type MarketQuote,
} from "./rules.js";
import type { PlayerRecord, PlayerRepository } from "../persistence/player-repository.js";
import type { MarketData } from "../prices/price-provider.js";

export interface GuessServiceOptions {
  quoteMaxAgeMs: number;
  historyLimit?: number;
}

export class GuessService {
  private readonly historyLimit: number;

  constructor(
    private readonly repository: PlayerRepository,
    private readonly market: MarketData,
    private readonly clock: Clock,
    private readonly ids: () => string = randomUUID,
    private readonly options: GuessServiceOptions,
  ) {
    this.historyLimit = options.historyLimit ?? HISTORY_LIMIT;
  }

  async createPlayer(tokenHash: string): Promise<PlayerRecord> {
    const now = new Date(this.clock.now()).toISOString();
    const player: PlayerRecord = {
      pk: tokenHash,
      score: 0,
      createdAt: now,
      updatedAt: now,
      activeGuess: null,
      history: [],
    };
    await this.repository.create(player);
    return player;
  }

  async getState(pk: string): Promise<PlayerRecord | null> {
    const player = await this.repository.get(pk);
    if (!player?.activeGuess) return player;
    if (!isPastDeadline(this.clock.now(), Date.parse(player.activeGuess.eligibleAt))) {
      return player;
    }
    await this.settlePlayer(player);
    return this.repository.get(pk);
  }

  async submitGuess(pk: string, direction: Direction): Promise<PlayerRecord> {
    const existing = await this.repository.get(pk);
    if (!existing) throw new PlayerNotFoundError();
    if (existing.activeGuess) throw new ActiveGuessError();

    const quote = await this.readUsableQuote(() => this.market.getQuote());
    const nowMs = this.clock.now();
    const createdAt = new Date(nowMs).toISOString();
    const guess = {
      guessId: this.ids(),
      direction,
      entryPrice: quote.price,
      createdAt,
      eligibleAt: new Date(nowMs + SETTLEMENT_DELAY_MS).toISOString(),
      status: "PENDING" as const,
    };

    const write = await this.repository.tryActivateGuess(pk, guess, createdAt);
    if (write === "conflict") throw new ActiveGuessError();
    if (write === "missing") throw new PlayerNotFoundError();

    const updated = await this.repository.get(pk);
    if (!updated) throw new PlayerNotFoundError();
    return updated;
  }

  /**
   * Apply the outcome at most once. A second call with a stale active guess
   * loses the conditional write and does not change the score.
   */
  async settlePlayer(player: PlayerRecord): Promise<"resolved" | "pending" | "idle"> {
    const guess = player.activeGuess;
    if (!guess) return "idle";

    const nowMs = this.clock.now();
    const eligibleAtMs = Date.parse(guess.eligibleAt);
    if (!isPastDeadline(nowMs, eligibleAtMs)) return "pending";

    let quote: MarketQuote;
    try {
      quote = await this.readUsableQuote(() => this.market.getSettlementQuote(eligibleAtMs));
    } catch {
      return "pending";
    }

    if (!quoteCoversDeadline(quote, eligibleAtMs)) return "pending";

    const delta = scoreDelta(guess.direction, guess.entryPrice, quote.price);
    if (delta === null) return "pending";

    const resolvedAt = new Date(nowMs).toISOString();
    const write = await this.repository.tryResolveGuess(
      player.pk,
      guess.guessId,
      {
        guessId: guess.guessId,
        direction: guess.direction,
        entryPrice: guess.entryPrice,
        settlementPrice: quote.price,
        createdAt: guess.createdAt,
        eligibleAt: guess.eligibleAt,
        resolvedAt,
        result: delta === 1 ? "CORRECT" : "INCORRECT",
        scoreDelta: delta,
      },
      delta,
      resolvedAt,
      this.historyLimit,
    );

    return write === "ok" ? "resolved" : "pending";
  }

  async settleDue(limit: number): Promise<number> {
    const nowIso = new Date(this.clock.now()).toISOString();
    const ids = await this.repository.listDuePlayerIds(nowIso, limit);
    let settled = 0;
    for (const pk of ids) {
      const player = await this.repository.get(pk);
      if (!player) continue;
      if ((await this.settlePlayer(player)) === "resolved") settled += 1;
    }
    return settled;
  }

  async getDisplayPrice(): Promise<{
    price: string;
    source: string;
    observedAt: string;
    fresh: boolean;
  }> {
    try {
      const quote = await this.market.getQuote();
      parsePrice(quote.price);
      return {
        price: quote.price,
        source: quote.source,
        observedAt: quote.observedAt,
        fresh: isFreshQuote(quote, this.clock.now(), this.options.quoteMaxAgeMs),
      };
    } catch (error) {
      if (error instanceof PriceUnavailableError) throw error;
      throw new PriceUnavailableError();
    }
  }

  toPlayerState(player: PlayerRecord): PlayerState {
    return {
      score: player.score,
      activeGuess: player.activeGuess,
      recentGuesses: [...player.history].reverse(),
      serverTime: new Date(this.clock.now()).toISOString(),
    };
  }

  private async readUsableQuote(load: () => Promise<MarketQuote>): Promise<MarketQuote> {
    try {
      const quote = await load();
      parsePrice(quote.price);
      if (!isFreshQuote(quote, this.clock.now(), this.options.quoteMaxAgeMs)) {
        throw new PriceUnavailableError("The latest Bitcoin quote is stale.");
      }
      return quote;
    } catch (error) {
      if (error instanceof PriceUnavailableError) throw error;
      throw new PriceUnavailableError();
    }
  }
}
