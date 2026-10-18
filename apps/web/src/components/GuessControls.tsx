import type { Direction } from "@arena/shared";
import { TrendingDown, TrendingUp } from "lucide-react";

interface GuessControlsProps {
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (direction: Direction) => void;
}

export function GuessControls({ disabled, submitting, error, onSubmit }: GuessControlsProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Your prediction</h2>
        <p className="text-sm text-slate-400">One open prediction at a time</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 text-base font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 disabled:cursor-not-allowed disabled:bg-emerald-900/40 disabled:text-emerald-100/50"
          aria-label="Predict price will go up"
          disabled={disabled}
          onClick={() => onSubmit("UP")}
        >
          <TrendingUp aria-hidden="true" />
          Up
        </button>
        <button
          type="button"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-rose-400 px-4 text-base font-semibold text-slate-950 transition hover:bg-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:cursor-not-allowed disabled:bg-rose-950/50 disabled:text-rose-100/50"
          aria-label="Predict price will go down"
          disabled={disabled}
          onClick={() => onSubmit("DOWN")}
        >
          <TrendingDown aria-hidden="true" />
          Down
        </button>
      </div>
      <p className="mt-3 min-h-6 text-sm text-slate-300" role="status">
        {submitting ? "Submitting prediction…" : error}
      </p>
    </section>
  );
}
