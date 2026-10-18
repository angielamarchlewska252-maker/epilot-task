import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";

export function createDynamoClient(endpoint?: string): DynamoDBClient {
  const config: DynamoDBClientConfig = {
    region: process.env.AWS_REGION ?? "eu-central-1",
  };

  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = {
      accessKeyId: "local",
      secretAccessKey: "local",
    };
  }

  return new DynamoDBClient(config);
}
