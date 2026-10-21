import { config as loadDotenv } from "dotenv";
import { COINGECKO_QUOTE_MAX_AGE_MS, MEXC_QUOTE_MAX_AGE_MS } from "./domain/rules.js";
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
  priceProvider: "mexc" | "coingecko" | "coinbase" | "mock";
  coinbaseUrl: string;
  coingeckoUrl: string;
  mexcUrl: string;
  quoteMaxAgeMs: number;
  allowedOrigins: string[];
  nodeEnv: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const priceProvider =
    env.PRICE_PROVIDER === "mock" ||
    env.PRICE_PROVIDER === "coinbase" ||
    env.PRICE_PROVIDER === "coingecko" ||
    env.PRICE_PROVIDER === "mexc"
      ? env.PRICE_PROVIDER
      : "coinbase";
  return {
    port: Number(env.PORT ?? 3001),
    tableName: env.TABLE_NAME ?? "Players",
    dynamoEndpoint: env.DYNAMODB_ENDPOINT || undefined,
    priceProvider,
    coinbaseUrl:
      env.COINBASE_TICKER_URL ?? "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
    coingeckoUrl:
      env.COINGECKO_PRICE_URL ??
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true&precision=2",
    mexcUrl: env.MEXC_TRADES_URL ?? "https://api.mexc.com/api/v3/trades?symbol=BTCUSDT&limit=1",
    quoteMaxAgeMs: Number(
      env.QUOTE_MAX_AGE_MS ??
        (priceProvider === "coinbase"
          ? 15_000
          : priceProvider === "coingecko"
            ? COINGECKO_QUOTE_MAX_AGE_MS
            : MEXC_QUOTE_MAX_AGE_MS),
    ),
    allowedOrigins: (env.ALLOWED_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
