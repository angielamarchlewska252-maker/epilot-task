import {
  CreateTableCommand,
  DynamoDBClient,
  type CreateTableCommandInput,
} from "@aws-sdk/client-dynamodb";
import dynalite from "dynalite";
import type { Server } from "node:http";
import { DUE_GUESSES_INDEX } from "./indexes.js";

export async function startDynalite(port = 0): Promise<{ server: Server; endpoint: string }> {
  const server = dynalite({ createTableMs: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Dynalite did not bind a TCP port.");
  }
  return { server, endpoint: `http://127.0.0.1:${address.port}` };
}

export async function createPlayersTable(client: DynamoDBClient, tableName: string): Promise<void> {
  const attributes = [
    { AttributeName: "pk", AttributeType: "S" as const },
    { AttributeName: "gsi1pk", AttributeType: "S" as const },
    { AttributeName: "gsi1sk", AttributeType: "S" as const },
  ];
  const keys = [{ AttributeName: "pk", KeyType: "HASH" as const }];
  const indexKeys = [
    { AttributeName: "gsi1pk", KeyType: "HASH" as const },
    { AttributeName: "gsi1sk", KeyType: "RANGE" as const },
  ];

  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: attributes,
        KeySchema: keys,
        GlobalSecondaryIndexes: [
          {
            IndexName: DUE_GUESSES_INDEX,
            KeySchema: indexKeys,
            Projection: { ProjectionType: "KEYS_ONLY" },
          },
        ],
      }),
    );
  } catch (error) {
    if (isNamed(error, "ResourceInUseException")) return;
    if (!isNamed(error, "ValidationException")) throw error;
    const fallback: CreateTableCommandInput = {
      TableName: tableName,
      AttributeDefinitions: attributes,
      KeySchema: keys,
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      GlobalSecondaryIndexes: [
        {
          IndexName: DUE_GUESSES_INDEX,
          KeySchema: indexKeys,
          Projection: { ProjectionType: "KEYS_ONLY" },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
      ],
    };
    try {
      await client.send(new CreateTableCommand(fallback));
    } catch (secondError) {
      if (isNamed(secondError, "ResourceInUseException")) return;
      throw secondError;
    }
  }
}

function isNamed(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === name;
}
