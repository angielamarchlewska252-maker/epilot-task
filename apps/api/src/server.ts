import { serve } from "@hono/node-server";
import { loadEnvFiles } from "./config.js";
import { buildRuntime } from "./composition.js";
import { createDynamoClient } from "./persistence/dynamo-client.js";
import { createPlayersTable, startDynalite } from "./persistence/local-dynamo.js";

loadEnvFiles();

if (!process.env.DYNAMODB_ENDPOINT) {
  const local = await startDynalite(8000);
  process.env.DYNAMODB_ENDPOINT = local.endpoint;
  console.log(`dynamodb listening on ${local.endpoint}`);
}

const runtime = buildRuntime();
await createPlayersTable(createDynamoClient(process.env.DYNAMODB_ENDPOINT), runtime.config.tableName);

serve(
  {
    fetch: runtime.app.fetch,
    port: runtime.config.port,
  },
  (info) => {
    console.log(`api listening on http://127.0.0.1:${info.port}`);
  },
);
