import type { Direction } from "@arena/shared";
import { comparePrices } from "./money.js";

export const SETTLEMENT_DELAY_MS = 60_000;
export const DEFAULT_QUOTE_MAX_AGE_MS = 15_000;
export const PRICE_CACHE_MS = 4_000;
export const HISTORY_LIMIT = 10;
export const QUOTE_FUTURE_SKEW_MS = 5_000;

export interface MarketQuote {
  price: string;
  observedAt: string;
  source: string;
}

/** Correct only when the price moved in the guessed direction. Equal prices return null. */
export function scoreDelta(
  direction: Direction,
  entryPrice: string,
  settlementPrice: string,
): 1 | -1 | null {
  const comparison = comparePrices(settlementPrice, entryPrice);
  if (comparison === 0) return null;
  const movedUp = comparison > 0;
  const correct = direction === "UP" ? movedUp : !movedUp;
  return correct ? 1 : -1;
}

export function isPastDeadline(nowMs: number, eligibleAtMs: number): boolean {
  return nowMs >= eligibleAtMs;
}

export function quoteCoversDeadline(quote: MarketQuote, eligibleAtMs: number): boolean {
  return Date.parse(quote.observedAt) >= eligibleAtMs;
}

export function quoteAgeMs(quote: MarketQuote, nowMs: number): number {
  return nowMs - Date.parse(quote.observedAt);
}

export function isFreshQuote(quote: MarketQuote, nowMs: number, maxAgeMs: number): boolean {
  const observedAt = Date.parse(quote.observedAt);
  if (!Number.isFinite(observedAt)) return false;
  if (observedAt > nowMs + QUOTE_FUTURE_SKEW_MS) return false;
  const age = nowMs - observedAt;
  return age >= 0 && age <= maxAgeMs;
}
