import { Bitcoin } from "lucide-react";

interface HeaderProps {
  marketStatus: string;
}

export function Header({ marketStatus }: HeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
          <Bitcoin aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-200/80 uppercase">
            Market game
          </p>
          <h1 className="text-2xl font-semibold text-white">BTC Prediction Arena</h1>
        </div>
      </div>
      <p className="max-w-md text-sm text-slate-300">
        Guess whether Bitcoin will be higher or lower after one minute.{" "}
        <span className="text-slate-100">{marketStatus}</span>
      </p>
    </header>
  );
}
