import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

let loaded = false;

export function loadEnvFiles(): void {
  if (loaded) return;
  loaded = true;
  loadDotenv({ path: resolve(process.cwd(), ".env") });
  loadDotenv({ path: resolve(process.cwd(), "../../.env") });
}

export interface AppConfig {
  port: number;
  tableName: string;
  dynamoEndpoint?: string;
  priceProvider: "coinbase" | "mock";
  coinbaseUrl: string;
  quoteMaxAgeMs: number;
  allowedOrigins: string[];
  nodeEnv: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    tableName: env.TABLE_NAME ?? "Players",
    dynamoEndpoint: env.DYNAMODB_ENDPOINT || undefined,
    priceProvider: env.PRICE_PROVIDER === "mock" ? "mock" : "coinbase",
    coinbaseUrl:
      env.COINBASE_TICKER_URL ?? "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
    quoteMaxAgeMs: Number(env.QUOTE_MAX_AGE_MS ?? 15_000),
    allowedOrigins: (env.ALLOWED_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
