import type { ActiveGuess } from "@arena/shared";
import { formatRemaining, formatTime, formatUsd } from "../lib/format";

interface ActiveGuessCardProps {
  guess: ActiveGuess;
  remainingMs: number | null;
  currentPrice: string | null;
  priceUnavailable: boolean;
  checking: boolean;
  onCheck: () => void;
}

export function ActiveGuessCard({
  guess,
  remainingMs,
  currentPrice,
  priceUnavailable,
  checking,
  onCheck,
}: ActiveGuessCardProps) {
  const waiting = remainingMs !== null && remainingMs > 0;
  const seconds = waiting ? Math.ceil(remainingMs / 1000) : 0;
  const phase = waiting
    ? "Your prediction is active."
    : "One minute has passed. Checking the next price change.";

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Active prediction</h2>
        <p className="rounded-full bg-slate-950/50 px-3 py-1 text-sm text-amber-100">
          {waiting ? "Pending" : "Checking market price"}
        </p>
      </div>
      <p className="mt-3 text-sm text-amber-50">{phase}</p>
      {waiting ? (
        <p className="mt-1 text-sm text-amber-100/90">
          Your prediction can resolve in {seconds} {seconds === 1 ? "second" : "seconds"}.
        </p>
      ) : null}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-300">Direction</dt>
          <dd className="text-base font-medium text-white">{guess.direction === "UP" ? "Up" : "Down"}</dd>
        </div>
        <div>
          <dt className="text-slate-300">Entry price</dt>
          <dd className="text-base font-medium text-white tabular-nums">{formatUsd(guess.entryPrice)}</dd>
        </div>
        <div>
          <dt className="text-slate-300">Submitted</dt>
          <dd className="text-base font-medium text-white">{formatTime(guess.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-300">Countdown</dt>
          <dd className="text-base font-medium text-white tabular-nums">
            {remainingMs === null ? "—" : formatRemaining(remainingMs)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-300">Current market price</dt>
          <dd className="text-base font-medium text-white tabular-nums">
            {currentPrice ? formatUsd(currentPrice) : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-300">Status</dt>
          <dd className="text-base font-medium text-white">{waiting ? "Waiting" : "Pending settlement"}</dd>
        </div>
      </dl>
      {priceUnavailable ? (
        <p className="mt-4 text-sm text-amber-50">
          Market data is temporarily unavailable. Your prediction is still safe.
        </p>
      ) : null}
      <button
        type="button"
        className="mt-4 min-h-11 rounded-xl border border-white/15 px-4 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:opacity-60"
        onClick={onCheck}
        disabled={checking}
      >
        {checking ? "Checking…" : "Check now"}
      </button>
    </section>
  );
}
