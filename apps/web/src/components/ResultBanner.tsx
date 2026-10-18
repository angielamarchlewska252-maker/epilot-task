import type { ResolvedGuess } from "@arena/shared";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatUsd, priceMoved } from "../lib/format";

interface ResultBannerProps {
  guess: ResolvedGuess;
}

export function ResultBanner({ guess }: ResultBannerProps) {
  const correct = guess.result === "CORRECT";
  const moved = priceMoved(guess.entryPrice, guess.settlementPrice);
  const directionLabel =
    moved === "up" ? "Price moved up" : moved === "down" ? "Price moved down" : "Price unchanged";

  return (
    <section
      className={`rounded-3xl border p-5 ${
        correct ? "border-emerald-300/40 bg-emerald-400/10" : "border-rose-300/40 bg-rose-400/10"
      }`}
      role="status"
    >
      <div className="flex items-start gap-3">
        {correct ? (
          <CheckCircle2 className="mt-0.5 text-emerald-300" aria-hidden="true" />
        ) : (
          <XCircle className="mt-0.5 text-rose-300" aria-hidden="true" />
        )}
        <div>
          <h2 className="text-lg font-semibold text-white">
            {correct ? "Correct prediction! +1 point." : "Incorrect prediction. -1 point."}
          </h2>
          <p className="mt-1 text-sm text-slate-200">
            {directionLabel}. Entry {formatUsd(guess.entryPrice)}, settlement{" "}
            {formatUsd(guess.settlementPrice)}. Score change {guess.scoreDelta > 0 ? "+1" : "-1"}.
          </p>
        </div>
      </div>
    </section>
  );
}
