import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveGuessCard } from "./components/ActiveGuessCard";
import { GuessControls } from "./components/GuessControls";
import { Header } from "./components/Header";
import { HistoryList } from "./components/HistoryList";
import { PriceCard } from "./components/PriceCard";
import { ResultBanner } from "./components/ResultBanner";
import { ScoreCard } from "./components/ScoreCard";
import { useArena } from "./hooks/useArena";

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: import.meta.env.MODE === "test" ? false : 1,
            refetchOnWindowFocus: import.meta.env.MODE !== "test",
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

function Dashboard() {
  const arena = useArena();
  const marketStatus = arena.priceLoading
    ? "Connecting to the market."
    : arena.priceError
      ? "Market data is temporarily unavailable."
      : arena.price?.fresh
        ? "Market data is live."
        : "Market data may be stale.";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
      <Header marketStatus={marketStatus} />
      {arena.playerError ? (
        <section className="rounded-3xl border border-rose-300/40 bg-rose-400/10 p-5" role="alert">
          <h2 className="text-lg font-semibold text-white">We could not load your session.</h2>
          <p className="mt-2 text-sm text-slate-200">
            Check your connection and try again. Your saved score is still on the server.
          </p>
          <button
            type="button"
            className="mt-4 min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950"
            onClick={() => arena.retryPlayer()}
          >
            Retry
          </button>
        </section>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
        <PriceCard
          price={arena.price?.price ?? null}
          observedAt={arena.price?.observedAt ?? null}
          fresh={arena.price?.fresh ?? false}
          loading={arena.priceLoading}
          unavailable={arena.priceError}
        />
        <ScoreCard score={arena.player?.score ?? null} loading={arena.playerLoading} />
      </div>
      {arena.banner ? <ResultBanner guess={arena.banner} /> : null}
      {arena.player?.activeGuess ? (
        <ActiveGuessCard
          guess={arena.player.activeGuess}
          remainingMs={arena.remainingMs}
          currentPrice={arena.price?.price ?? null}
          priceUnavailable={arena.priceError}
          checking={arena.checking}
          onCheck={() => arena.checkNow()}
        />
      ) : null}
      <GuessControls
        disabled={arena.playerLoading || arena.submitting || Boolean(arena.player?.activeGuess)}
        submitting={arena.submitting}
        error={arena.actionError}
        onSubmit={arena.submit}
      />
      <HistoryList guesses={arena.player?.recentGuesses ?? []} />
      <p className="text-sm text-slate-400">
        A prediction can resolve after 60 seconds, and only when the live price is different from
        the entry price. Equal prices stay open.
      </p>
    </main>
  );
}
