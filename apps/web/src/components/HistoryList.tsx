import type { ResolvedGuess } from "@arena/shared";
import { formatUsd } from "../lib/format";

interface HistoryListProps {
  guesses: ResolvedGuess[];
}

export function HistoryList({ guesses }: HistoryListProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-white">Recent predictions</h2>
      {guesses.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No resolved predictions yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Recent predictions</caption>
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 font-medium">Direction</th>
                <th className="py-2 font-medium">Entry</th>
                <th className="py-2 font-medium">Settlement</th>
                <th className="py-2 font-medium">Result</th>
                <th className="py-2 font-medium">Score change</th>
              </tr>
            </thead>
            <tbody>
              {guesses.map((guess) => (
                <tr key={guess.guessId} className="border-t border-white/10 text-slate-100">
                  <td className="py-3">{guess.direction === "UP" ? "Up" : "Down"}</td>
                  <td className="py-3 tabular-nums">{formatUsd(guess.entryPrice)}</td>
                  <td className="py-3 tabular-nums">{formatUsd(guess.settlementPrice)}</td>
                  <td className="py-3">{guess.result === "CORRECT" ? "Correct" : "Incorrect"}</td>
                  <td className="py-3 tabular-nums">{guess.scoreDelta > 0 ? "+1" : "-1"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
