import type { ActiveGuess, Direction, GuessResult, ResolvedGuess } from "@arena/shared";
import type { PlayerRecord, PlayerRepository, WriteResult } from "./player-repository.js";

/** The small slice of D1 this repository uses. Miniflare and Workers both match it. */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement;
}

interface PlayerRow {
  score: number;
  created_at: string;
  updated_at: string;
}

interface ActiveRow {
  guess_id: string;
  direction: Direction;
  entry_price: string;
  created_at: string;
  eligible_at: string;
}

interface HistoryRow {
  guess_id: string;
  direction: Direction;
  entry_price: string;
  settlement_price: string;
  created_at: string;
  eligible_at: string;
  resolved_at: string;
  result: GuessResult;
  score_delta: number;
}

const ACTIVATE_SQL = `
INSERT INTO active_guesses (pk, guess_id, direction, entry_price, created_at, eligible_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6
WHERE EXISTS (SELECT 1 FROM players WHERE pk = ?1)
  AND NOT EXISTS (SELECT 1 FROM active_guesses WHERE pk = ?1)
`;

const RESOLVE_SQL = `
INSERT INTO guess_history (
  pk, guess_id, direction, entry_price, settlement_price,
  created_at, eligible_at, resolved_at, result, score_delta
)
SELECT pk, guess_id, direction, entry_price, ?1, created_at, eligible_at, ?2, ?3, ?4
FROM active_guesses
WHERE pk = ?5 AND guess_id = ?6
`;

export class D1PlayerRepository implements PlayerRepository {
  constructor(private readonly db: SqlDatabase) {}

  async create(player: PlayerRecord): Promise<void> {
    try {
      const result = await this.db
        .prepare(
          "INSERT INTO players (pk, score, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(player.pk, player.score, player.createdAt, player.updatedAt)
        .run();
      if ((result.meta.changes ?? 0) < 1) {
        throw new Error("Player already exists.");
      }
    } catch (error) {
      if (isConstraint(error)) throw new Error("Player already exists.");
      throw error;
    }
  }

  async get(pk: string): Promise<PlayerRecord | null> {
    const player = await this.db
      .prepare("SELECT score, created_at, updated_at FROM players WHERE pk = ?1")
      .bind(pk)
      .first<PlayerRow>();
    if (!player) return null;

    const active = await this.db
      .prepare(
        `SELECT guess_id, direction, entry_price, created_at, eligible_at
         FROM active_guesses WHERE pk = ?1`,
      )
      .bind(pk)
      .first<ActiveRow>();

    const history = await this.db
      .prepare(
        `SELECT guess_id, direction, entry_price, settlement_price, created_at, eligible_at,
                resolved_at, result, score_delta
         FROM guess_history WHERE pk = ?1 ORDER BY id ASC`,
      )
      .bind(pk)
      .all<HistoryRow>();

    return {
      pk,
      score: player.score,
      createdAt: player.created_at,
      updatedAt: player.updated_at,
      activeGuess: active ? toActive(active) : null,
      history: history.results.map(toResolved),
    };
  }

  async tryActivateGuess(pk: string, guess: ActiveGuess, updatedAt: string): Promise<WriteResult> {
    try {
      const result = await this.db
        .prepare(ACTIVATE_SQL)
        .bind(pk, guess.guessId, guess.direction, guess.entryPrice, guess.createdAt, guess.eligibleAt)
        .run();
      if ((result.meta.changes ?? 0) > 0) {
        await this.db.prepare("UPDATE players SET updated_at = ?2 WHERE pk = ?1").bind(pk, updatedAt).run();
        return "ok";
      }
    } catch (error) {
      if (!isConstraint(error)) throw error;
    }
    const current = await this.get(pk);
    return current ? "conflict" : "missing";
  }

  async tryResolveGuess(
    pk: string,
    guessId: string,
    resolved: ResolvedGuess,
    scoreDelta: 1 | -1,
    updatedAt: string,
    historyLimit: number,
  ): Promise<WriteResult> {
    try {
      const result = await this.db
        .prepare(RESOLVE_SQL)
        .bind(resolved.settlementPrice, updatedAt, resolved.result, scoreDelta, pk, guessId)
        .run();
      if ((result.meta.changes ?? 0) < 1) {
        const current = await this.get(pk);
        return current ? "conflict" : "missing";
      }
    } catch (error) {
      if (!isConstraint(error)) throw error;
      const current = await this.get(pk);
      return current ? "conflict" : "missing";
    }

    try {
      await this.db
        .prepare(
          `DELETE FROM guess_history
           WHERE pk = ?1
             AND id NOT IN (
               SELECT id FROM guess_history WHERE pk = ?1 ORDER BY id DESC LIMIT ?2
             )`,
        )
        .bind(pk, historyLimit)
        .run();
    } catch {
      console.error("history_trim_failed");
    }
    return "ok";
  }

  async listDuePlayerIds(nowIso: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .prepare(
        `SELECT pk FROM active_guesses
         WHERE eligible_at <= ?1
         ORDER BY eligible_at ASC
         LIMIT ?2`,
      )
      .bind(nowIso, limit)
      .all<{ pk: string }>();
    return rows.results.map((row) => row.pk);
  }
}

function toActive(row: ActiveRow): ActiveGuess {
  return {
    guessId: row.guess_id,
    direction: row.direction,
    entryPrice: row.entry_price,
    createdAt: row.created_at,
    eligibleAt: row.eligible_at,
    status: "PENDING",
  };
}

function toResolved(row: HistoryRow): ResolvedGuess {
  const scoreDelta = row.score_delta === -1 ? -1 : 1;
  return {
    guessId: row.guess_id,
    direction: row.direction,
    entryPrice: row.entry_price,
    settlementPrice: row.settlement_price,
    createdAt: row.created_at,
    eligibleAt: row.eligible_at,
    resolvedAt: row.resolved_at,
    result: row.result,
    scoreDelta,
  };
}

function isConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message);
}
