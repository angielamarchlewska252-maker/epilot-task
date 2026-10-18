import type { ActiveGuess, ResolvedGuess } from "@arena/shared";
import type { PlayerRecord, PlayerRepository, WriteResult } from "./player-repository.js";

/**
 * In-memory stand-in with the same conditional outcomes as DynamoDB.
 * A queue serializes writes so overlapping guesses cannot both succeed.
 */
export class MemoryPlayerRepository implements PlayerRepository {
  private readonly players = new Map<string, PlayerRecord>();
  private chain: Promise<unknown> = Promise.resolve();

  private lock<T>(work: () => T): Promise<T> {
    const run = this.chain.then(() => work());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async create(player: PlayerRecord): Promise<void> {
    await this.lock(() => {
      if (this.players.has(player.pk)) {
        throw new Error("Player already exists.");
      }
      this.players.set(player.pk, structuredClone(player));
    });
  }

  async get(pk: string): Promise<PlayerRecord | null> {
    const player = this.players.get(pk);
    return player ? structuredClone(player) : null;
  }

  async tryActivateGuess(pk: string, guess: ActiveGuess, updatedAt: string): Promise<WriteResult> {
    return this.lock(() => {
      const player = this.players.get(pk);
      if (!player) return "missing";
      if (player.activeGuess) return "conflict";
      player.activeGuess = structuredClone(guess);
      player.updatedAt = updatedAt;
      return "ok";
    });
  }

  async tryResolveGuess(
    pk: string,
    guessId: string,
    resolved: ResolvedGuess,
    scoreDelta: 1 | -1,
    updatedAt: string,
    historyLimit: number,
  ): Promise<WriteResult> {
    return this.lock(() => {
      const player = this.players.get(pk);
      if (!player) return "missing";
      if (!player.activeGuess || player.activeGuess.guessId !== guessId) return "conflict";
      player.score += scoreDelta;
      player.history = [...player.history, structuredClone(resolved)].slice(-historyLimit);
      player.activeGuess = null;
      player.updatedAt = updatedAt;
      return "ok";
    });
  }

  async listDuePlayerIds(nowIso: string, limit: number): Promise<string[]> {
    return [...this.players.values()]
      .filter((player) => player.activeGuess && player.activeGuess.eligibleAt <= nowIso)
      .slice(0, limit)
      .map((player) => player.pk);
  }
}
