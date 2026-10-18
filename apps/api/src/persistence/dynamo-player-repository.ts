import type { ActiveGuess, ResolvedGuess } from "@arena/shared";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DUE_GUESSES_INDEX } from "./indexes.js";
import type { PlayerRecord, PlayerRepository, WriteResult } from "./player-repository.js";

interface PlayerItem {
  pk: string;
  score: number;
  createdAt: string;
  updatedAt: string;
  activeGuess?: ActiveGuess;
  history?: ResolvedGuess[];
}

export class DynamoPlayerRepository implements PlayerRepository {
  constructor(
    private readonly documents: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(player: PlayerRecord): Promise<void> {
    await this.documents.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: player.pk,
          score: player.score,
          createdAt: player.createdAt,
          updatedAt: player.updatedAt,
          history: player.history,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  async get(pk: string): Promise<PlayerRecord | null> {
    const result = await this.documents.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk },
        ConsistentRead: true,
      }),
    );
    return this.toRecord(result.Item as PlayerItem | undefined);
  }

  async tryActivateGuess(pk: string, guess: ActiveGuess, updatedAt: string): Promise<WriteResult> {
    try {
      await this.documents.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk },
          ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(activeGuess)",
          UpdateExpression:
            "SET activeGuess = :guess, updatedAt = :updatedAt, gsi1pk = :gsi1pk, gsi1sk = :gsi1sk",
          ExpressionAttributeValues: {
            ":guess": guess,
            ":updatedAt": updatedAt,
            ":gsi1pk": "ACTIVE",
            ":gsi1sk": guess.eligibleAt,
          },
        }),
      );
      return "ok";
    } catch (error) {
      if (!isConditionalFailure(error)) throw error;
      const current = await this.get(pk);
      return current ? "conflict" : "missing";
    }
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
      const result = await this.documents.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk },
          ConditionExpression: "activeGuess.guessId = :guessId",
          UpdateExpression:
            "SET score = score + :delta, updatedAt = :updatedAt, history = list_append(if_not_exists(history, :empty), :entry) REMOVE activeGuess, gsi1pk, gsi1sk",
          ExpressionAttributeValues: {
            ":guessId": guessId,
            ":delta": scoreDelta,
            ":updatedAt": updatedAt,
            ":empty": [],
            ":entry": [resolved],
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      const history = (result.Attributes?.history as ResolvedGuess[] | undefined) ?? [];
      if (history.length > historyLimit) {
        try {
          await this.documents.send(
            new UpdateCommand({
              TableName: this.tableName,
              Key: { pk },
              UpdateExpression: "SET history = :history",
              ExpressionAttributeValues: {
                ":history": history.slice(-historyLimit),
              },
            }),
          );
        } catch {
          console.error("history_trim_failed");
        }
      }
      return "ok";
    } catch (error) {
      if (!isConditionalFailure(error)) throw error;
      const current = await this.get(pk);
      return current ? "conflict" : "missing";
    }
  }

  async listDuePlayerIds(nowIso: string, limit: number): Promise<string[]> {
    const result = await this.documents.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: DUE_GUESSES_INDEX,
        KeyConditionExpression: "gsi1pk = :pk AND gsi1sk <= :now",
        ExpressionAttributeValues: {
          ":pk": "ACTIVE",
          ":now": nowIso,
        },
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map((item) => String(item.pk));
  }

  private toRecord(item: PlayerItem | undefined): PlayerRecord | null {
    if (!item) return null;
    return {
      pk: item.pk,
      score: item.score,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      activeGuess: item.activeGuess ?? null,
      history: item.history ?? [],
    };
  }
}

function isConditionalFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "ConditionalCheckFailedException";
}
