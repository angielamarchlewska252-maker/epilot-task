import { formatTime, formatUsd } from "../lib/format";

interface PriceCardProps {
  price: string | null;
  observedAt: string | null;
  fresh: boolean;
  loading: boolean;
  unavailable: boolean;
}

export function PriceCard({ price, observedAt, fresh, loading, unavailable }: PriceCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
      <p className="text-sm text-slate-300">Bitcoin market price</p>
      <h2 className="mt-2 text-4xl font-semibold tracking-tight text-white tabular-nums sm:text-5xl">
        {loading ? "Loading price…" : price ? formatUsd(price) : "—"}
      </h2>
      <p className="mt-3 text-sm text-slate-400">
        {unavailable
          ? "Market data is temporarily unavailable."
          : observedAt
            ? `Last trade ${formatTime(observedAt)}`
            : "Waiting for the latest trade."}
      </p>
      {!loading && !unavailable && !fresh ? (
        <p className="mt-2 text-sm text-amber-200" role="status">
          This price looks stale. New predictions stay closed until a fresh trade arrives.
        </p>
      ) : null}
    </section>
  );
}
