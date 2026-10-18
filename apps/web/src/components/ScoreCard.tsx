interface ScoreCardProps {
  score: number | null;
  loading: boolean;
}

export function ScoreCard({ score, loading }: ScoreCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5" aria-label="Current score">
      <p className="text-sm text-slate-300">Current score</p>
      <p className="mt-2 text-5xl font-semibold text-white tabular-nums" aria-live="polite">
        {loading || score === null ? "…" : score}
      </p>
      <p className="mt-3 text-sm text-slate-400">
        {loading ? "Loading score…" : "A correct guess adds 1. An incorrect guess subtracts 1."}
      </p>
    </section>
  );
}
