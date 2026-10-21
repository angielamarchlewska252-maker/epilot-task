import { randomUUID } from "node:crypto";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { systemClock } from "./domain/clock.js";
import { GuessService } from "./domain/guess-service.js";
import { COINGECKO_PRICE_CACHE_MS, MEXC_PRICE_CACHE_MS, PRICE_CACHE_MS } from "./domain/rules.js";
import { createApp } from "./http/app.js";
import { loadConfig } from "./config.js";
import { createDynamoClient } from "./persistence/dynamo-client.js";
import { DynamoPlayerRepository } from "./persistence/dynamo-player-repository.js";
import { CachedPriceProvider } from "./prices/cached-price-provider.js";
import { CoinbasePriceProvider } from "./prices/coinbase-price-provider.js";
import { CoinGeckoPriceProvider } from "./prices/coingecko-price-provider.js";
import { MexcPriceProvider } from "./prices/mexc-price-provider.js";
import { MockPriceProvider } from "./prices/mock-price-provider.js";

export function buildRuntime(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const client = createDynamoClient(config.dynamoEndpoint);
  const documents = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  const repository = new DynamoPlayerRepository(documents, config.tableName);
  const clock = systemClock;
  const mock =
    config.priceProvider === "mock"
      ? new MockPriceProvider(
          {
            price: "70000.00",
            observedAt: new Date(clock.now()).toISOString(),
            source: "mock",
          },
          clock,
        )
      : null;
  const market = new CachedPriceProvider(
    mock ??
      (config.priceProvider === "coinbase"
        ? new CoinbasePriceProvider(config.coinbaseUrl)
        : config.priceProvider === "coingecko"
          ? new CoinGeckoPriceProvider(config.coingeckoUrl)
          : new MexcPriceProvider(config.mexcUrl)),
    config.priceProvider === "coingecko"
      ? COINGECKO_PRICE_CACHE_MS
      : config.priceProvider === "mexc"
        ? MEXC_PRICE_CACHE_MS
        : PRICE_CACHE_MS,
    clock,
  );
  const service = new GuessService(repository, market, clock, randomUUID, {
    quoteMaxAgeMs: config.quoteMaxAgeMs,
  });
  const allowDevTools = mock !== null && config.nodeEnv !== "production";
  const app = createApp({
    service,
    clock,
    allowedOrigins: config.allowedOrigins,
    devQuote: allowDevTools
      ? (price) => {
          mock?.setPrice(price);
          market.invalidate();
        }
      : undefined,
  });

  return { app, config, client, service };
}
