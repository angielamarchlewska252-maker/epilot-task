import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { GuessService } from "../domain/guess-service.js";
import { ManualClock } from "../domain/clock.js";
import { createDynamoClient } from "./dynamo-client.js";
import { DynamoPlayerRepository } from "./dynamo-player-repository.js";
import { createPlayersTable, startDynalite } from "./local-dynamo.js";
import type { MarketData } from "../prices/price-provider.js";
import type { MarketQuote } from "../domain/rules.js";

class FakeMarket implements MarketData {
  price = "70000";
  constructor(private readonly clock: ManualClock) {}
  async getQuote(): Promise<MarketQuote> {
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

describe("DynamoPlayerRepository", () => {
  let server: Server;
  let repository: DynamoPlayerRepository;
  const tableName = "PlayersTest";

  beforeAll(async () => {
    const local = await startDynalite(0);
    server = local.server;
    const client = createDynamoClient(local.endpoint);
    await createPlayersTable(client, tableName);
    repository = new DynamoPlayerRepository(
      DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true },
      }),
      tableName,
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("persists a new player at score zero and restores that state", async () => {
    await repository.create({
      pk: "hash-a",
      score: 0,
      createdAt: "2026-10-18T12:00:00.000Z",
      updatedAt: "2026-10-18T12:00:00.000Z",
      activeGuess: null,
      history: [],
    });
    const loaded = await repository.get("hash-a");
    expect(loaded?.score).toBe(0);
    expect(loaded?.activeGuess).toBeNull();
  });

  it("accepts only one of two simultaneous guesses", async () => {
    await repository.create({
      pk: "hash-b",
      score: 0,
      createdAt: "2026-10-18T12:00:00.000Z",
      updatedAt: "2026-10-18T12:00:00.000Z",
      activeGuess: null,
      history: [],
    });
    const guess = {
      guessId: "g1",
      direction: "UP" as const,
      entryPrice: "70000",
      createdAt: "2026-10-18T12:00:00.000Z",
      eligibleAt: "2026-10-18T12:01:00.000Z",
      status: "PENDING" as const,
    };
    const other = { ...guess, guessId: "g2", direction: "DOWN" as const };
    const results = await Promise.all([
      repository.tryActivateGuess("hash-b", guess, guess.createdAt),
      repository.tryActivateGuess("hash-b", other, other.createdAt),
    ]);
    expect(results.filter((result) => result === "ok")).toHaveLength(1);
    expect(results.filter((result) => result === "conflict")).toHaveLength(1);
    const stored = await repository.get("hash-b");
    expect(stored?.activeGuess?.guessId).toMatch(/^g[12]$/);
  });

  it("changes the score once when resolution is retried", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const market = new FakeMarket(clock);
    const service = new GuessService(repository, market, clock, () => "guess-once", {
      quoteMaxAgeMs: 15_000,
    });
    await service.createPlayer("hash-c");
    await service.submitGuess("hash-c", "UP");
    clock.advance(60_000);
    market.price = "71000";
    const stale = await repository.get("hash-c");
    expect(await service.settlePlayer(stale!)).toBe("resolved");
    expect(await service.settlePlayer(stale!)).toBe("pending");
    expect((await repository.get("hash-c"))?.score).toBe(1);
    expect((await repository.get("hash-c"))?.activeGuess).toBeNull();
  });

  it("lists only due active guesses and trims history", async () => {
    await repository.create({
      pk: "hash-d",
      score: 0,
      createdAt: "2026-10-18T12:00:00.000Z",
      updatedAt: "2026-10-18T12:00:00.000Z",
      activeGuess: null,
      history: [],
    });
    await repository.tryActivateGuess(
      "hash-d",
      {
        guessId: "future",
        direction: "UP",
        entryPrice: "70000",
        createdAt: "2026-10-18T12:00:00.000Z",
        eligibleAt: "2026-10-18T12:05:00.000Z",
        status: "PENDING",
      },
      "2026-10-18T12:00:00.000Z",
    );
    expect(await repository.listDuePlayerIds("2026-10-18T12:01:00.000Z", 10)).not.toContain("hash-d");

    await repository.create({
      pk: "hash-due",
      score: 0,
      createdAt: "2026-10-18T12:00:00.000Z",
      updatedAt: "2026-10-18T12:00:00.000Z",
      activeGuess: null,
      history: [],
    });
    await repository.tryActivateGuess(
      "hash-due",
      {
        guessId: "due-1",
        direction: "DOWN",
        entryPrice: "70000",
        createdAt: "2026-10-18T12:00:00.000Z",
        eligibleAt: "2026-10-18T12:01:00.000Z",
        status: "PENDING",
      },
      "2026-10-18T12:00:00.000Z",
    );
    const due = await repository.listDuePlayerIds("2026-10-18T12:01:00.000Z", 10);
    expect(due).toContain("hash-due");
    expect(due).not.toContain("hash-c");

    for (let index = 0; index < 12; index += 1) {
      const current = await repository.get("hash-d");
      if (current?.activeGuess) {
        await repository.tryResolveGuess(
          "hash-d",
          current.activeGuess.guessId,
          {
            guessId: current.activeGuess.guessId,
            direction: "UP",
            entryPrice: "70000",
            settlementPrice: "71000",
            createdAt: current.activeGuess.createdAt,
            eligibleAt: current.activeGuess.eligibleAt,
            resolvedAt: `2026-10-18T12:02:${String(index).padStart(2, "0")}.000Z`,
            result: "CORRECT",
            scoreDelta: 1,
          },
          1,
          `2026-10-18T12:02:${String(index).padStart(2, "0")}.000Z`,
          10,
        );
      }
      await repository.tryActivateGuess(
        "hash-d",
        {
          guessId: `extra-${index}`,
          direction: "DOWN",
          entryPrice: "70000",
          createdAt: "2026-10-18T12:03:00.000Z",
          eligibleAt: "2026-10-18T12:04:00.000Z",
          status: "PENDING",
        },
        "2026-10-18T12:03:00.000Z",
      );
    }
    const trimmed = await repository.get("hash-d");
    expect(trimmed?.history.length).toBeLessThanOrEqual(10);
  });
});
