import { systemClock } from "./domain/clock.js";
import { GuessService } from "./domain/guess-service.js";
import {
  COINGECKO_PRICE_CACHE_MS,
  COINGECKO_QUOTE_MAX_AGE_MS,
  MEXC_PRICE_CACHE_MS,
  MEXC_QUOTE_MAX_AGE_MS,
  PRICE_CACHE_MS,
} from "./domain/rules.js";
import { createApp } from "./http/app.js";
import { D1PlayerRepository, type SqlDatabase } from "./persistence/d1-player-repository.js";
import { CachedPriceProvider } from "./prices/cached-price-provider.js";
import { CoinbasePriceProvider } from "./prices/coinbase-price-provider.js";
import { COINGECKO_BTC_URL, CoinGeckoPriceProvider } from "./prices/coingecko-price-provider.js";
import { MEXC_BTC_TRADES_URL, MexcPriceProvider } from "./prices/mexc-price-provider.js";

export interface WorkerEnv {
  DB: SqlDatabase;
  ALLOWED_ORIGIN?: string;
  PRICE_PROVIDER?: string;
  COINGECKO_PRICE_URL?: string;
  COINBASE_TICKER_URL?: string;
  MEXC_TRADES_URL?: string;
  QUOTE_MAX_AGE_MS?: string;
}

const COINBASE_URL = "https://api.exchange.coinbase.com/products/BTC-USD/ticker";

let cachedMarket: { key: string; market: CachedPriceProvider } | undefined;

type PriceProviderName = "mexc" | "coingecko" | "coinbase";

function selectedProvider(value: string | undefined): PriceProviderName {
  if (value === "coinbase" || value === "coingecko" || value === "mexc") return value;
  return "coinbase";
}

function defaultMaxAge(provider: PriceProviderName): number {
  if (provider === "coinbase") return 15_000;
  if (provider === "coingecko") return COINGECKO_QUOTE_MAX_AGE_MS;
  return MEXC_QUOTE_MAX_AGE_MS;
}

export function createArena(env: WorkerEnv) {
  const priceProvider = selectedProvider(env.PRICE_PROVIDER);
  const market = marketFor(env, priceProvider);
  const service = new GuessService(new D1PlayerRepository(env.DB), market, systemClock, undefined, {
    quoteMaxAgeMs: Number(env.QUOTE_MAX_AGE_MS ?? defaultMaxAge(priceProvider)),
  });
  const allowedOrigins = (env.ALLOWED_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const app = createApp({ service, clock: systemClock, allowedOrigins });
  return { app, service };
}

const worker = {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return Promise.resolve(createArena(env).app.fetch(request));
  },
  async scheduled(_event: unknown, env: WorkerEnv): Promise<void> {
    const settled = await createArena(env).service.settleDue(25);
    console.log(JSON.stringify({ settled }));
  },
};

export default worker;

const liveFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

function marketFor(env: WorkerEnv, priceProvider: PriceProviderName): CachedPriceProvider {
  const url =
    priceProvider === "coinbase"
      ? (env.COINBASE_TICKER_URL ?? COINBASE_URL)
      : priceProvider === "coingecko"
        ? (env.COINGECKO_PRICE_URL ?? COINGECKO_BTC_URL)
        : (env.MEXC_TRADES_URL ?? MEXC_BTC_TRADES_URL);
  const key = `${priceProvider}:${url}`;
  if (cachedMarket?.key === key) return cachedMarket.market;
  const inner =
    priceProvider === "coinbase"
      ? new CoinbasePriceProvider(url, liveFetch)
      : priceProvider === "coingecko"
        ? new CoinGeckoPriceProvider(url, liveFetch)
        : new MexcPriceProvider(url, liveFetch);
  const market = new CachedPriceProvider(
    inner,
    priceProvider === "coinbase"
      ? PRICE_CACHE_MS
      : priceProvider === "coingecko"
        ? COINGECKO_PRICE_CACHE_MS
        : MEXC_PRICE_CACHE_MS,
    systemClock,
  );
  cachedMarket = { key, market };
  return market;
}
