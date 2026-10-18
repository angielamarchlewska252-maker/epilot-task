import type { ActiveGuess, ResolvedGuess } from "@arena/shared";

export interface PlayerRecord {
  pk: string;
  score: number;
  createdAt: string;
  updatedAt: string;
  activeGuess: ActiveGuess | null;
  history: ResolvedGuess[];
}

export type WriteResult = "ok" | "conflict" | "missing";

export interface PlayerRepository {
  create(player: PlayerRecord): Promise<void>;
  get(pk: string): Promise<PlayerRecord | null>;
  tryActivateGuess(pk: string, guess: ActiveGuess, updatedAt: string): Promise<WriteResult>;
  tryResolveGuess(
    pk: string,
    guessId: string,
    resolved: ResolvedGuess,
    scoreDelta: 1 | -1,
    updatedAt: string,
    historyLimit: number,
  ): Promise<WriteResult>;
  listDuePlayerIds(nowIso: string, limit: number): Promise<string[]>;
}
