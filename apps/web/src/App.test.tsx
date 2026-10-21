import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PLAYER_TOKEN_KEY } from "./lib/session";

const serverTime = "2026-10-18T12:00:00.000Z";

function playerState(overrides: Record<string, unknown> = {}) {
  return {
    score: 0,
    activeGuess: null,
    recentGuesses: [],
    serverTime,
    ...overrides,
  };
}

function priceState(overrides: Record<string, unknown> = {}) {
  return {
    price: "70123.45",
    source: "coinbase-exchange:BTC-USD",
    observedAt: serverTime,
    fresh: true,
    serverTime,
    ...overrides,
  };
}

function activeGuess(direction: "UP" | "DOWN" = "UP", eligibleAt = "2026-10-18T12:01:00.000Z") {
  return {
    guessId: "guess-1",
    direction,
    entryPrice: "70123.45",
    createdAt: serverTime,
    eligibleAt,
    status: "PENDING" as const,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return Promise.resolve(handler(url, init));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectScore(value: string) {
  const region = screen.getByRole("region", { name: "Current score" });
  expect(within(region).getByText(value, { exact: true })).toBeInTheDocument();
}

describe("BTC Prediction Arena", () => {
  it("shows a new player's zero score and the current BTC price", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/players")) {
        return jsonResponse({ token: "new-token", player: playerState() });
      }
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      throw new Error(url);
    });

    render(<App />);

    expect(await screen.findByText("$70,123.45")).toBeInTheDocument();
    expect(screen.getByText("BTC/USD")).toBeInTheDocument();
    expectScore("0");
    expect(screen.getByRole("button", { name: "Predict price will go up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Predict price will go down" })).toBeEnabled();
  });

  it("submits UP and DOWN guesses", async () => {
    const user = userEvent.setup();
    const bodies: string[] = [];
    installFetch((url, init) => {
      if (url.endsWith("/api/players")) {
        return jsonResponse({ token: "new-token", player: playerState() });
      }
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      if (url.endsWith("/api/guesses")) {
        bodies.push(String(init?.body));
        const direction = JSON.parse(String(init?.body)).direction as "UP" | "DOWN";
        return jsonResponse(playerState({ activeGuess: activeGuess(direction) }), 201);
      }
      throw new Error(url);
    });

    const view = render(<App />);
    await user.click(await screen.findByRole("button", { name: "Predict price will go up" }));
    expect(bodies.at(-1)).toContain('"direction":"UP"');
    expect(await screen.findByText("Your prediction is active.")).toBeInTheDocument();

    view.unmount();
    localStorage.clear();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Predict price will go down" }));
    expect(bodies.at(-1)).toContain('"direction":"DOWN"');
  });

  it("disables both buttons while a guess is active", async () => {
    localStorage.setItem(PLAYER_TOKEN_KEY, "returning-token");
    installFetch((url) => {
      if (url.endsWith("/api/me")) {
        return jsonResponse(playerState({ score: -2, activeGuess: activeGuess("DOWN") }));
      }
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      throw new Error(url);
    });

    render(<App />);

    await waitFor(() => {
      expectScore("-2");
    });
    expect(screen.getByText("Active prediction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Predict price will go up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Predict price will go down" })).toBeDisabled();
  });

  it("shows loading states before data arrives", async () => {
    let resolvePlayer: (response: Response) => void = () => undefined;
    let resolvePrice: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/players")) {
          return new Promise<Response>((resolve) => {
            resolvePlayer = resolve;
          });
        }
        if (url.includes("/api/price")) {
          return new Promise<Response>((resolve) => {
            resolvePrice = resolve;
          });
        }
        return Promise.reject(new Error(url));
      }),
    );

    render(<App />);

    expect(await screen.findByText("Loading price…")).toBeInTheDocument();
    expect(screen.getByText("Loading score…")).toBeInTheDocument();

    resolvePlayer(jsonResponse({ token: "new-token", player: playerState() }));
    resolvePrice(jsonResponse(priceState()));

    expect(await screen.findByText("$70,123.45")).toBeInTheDocument();
  });

  it("shows a correct result after the server settles the guess", async () => {
    const user = userEvent.setup();
    localStorage.setItem(PLAYER_TOKEN_KEY, "returning-token");
    let reads = 0;
    installFetch((url) => {
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      if (url.endsWith("/api/me")) {
        reads += 1;
        if (reads === 1) {
          return jsonResponse(
            playerState({
              activeGuess: activeGuess("UP", "2026-10-18T11:59:00.000Z"),
            }),
          );
        }
        return jsonResponse(
          playerState({
            score: 1,
            recentGuesses: [
              {
                guessId: "guess-1",
                direction: "UP",
                entryPrice: "70123.45",
                settlementPrice: "71000.00",
                createdAt: serverTime,
                eligibleAt: "2026-10-18T11:59:00.000Z",
                resolvedAt: serverTime,
                result: "CORRECT",
                scoreDelta: 1,
              },
            ],
          }),
        );
      }
      throw new Error(url);
    });

    render(<App />);
    expect(await screen.findByText("Checking market price")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check now" }));
    expect(await screen.findByText("Correct prediction! +1 point.")).toBeInTheDocument();
    expectScore("1");
    expect(screen.getByRole("button", { name: "Predict price will go up" })).toBeEnabled();
  });

  it("shows an incorrect result", async () => {
    const user = userEvent.setup();
    localStorage.setItem(PLAYER_TOKEN_KEY, "returning-token");
    let reads = 0;
    installFetch((url) => {
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      if (url.endsWith("/api/me")) {
        reads += 1;
        if (reads === 1) {
          return jsonResponse(playerState({ activeGuess: activeGuess("DOWN", "2026-10-18T11:59:00.000Z") }));
        }
        return jsonResponse(
          playerState({
            score: -1,
            recentGuesses: [
              {
                guessId: "guess-1",
                direction: "DOWN",
                entryPrice: "70123.45",
                settlementPrice: "72000.00",
                createdAt: serverTime,
                eligibleAt: "2026-10-18T11:59:00.000Z",
                resolvedAt: serverTime,
                result: "INCORRECT",
                scoreDelta: -1,
              },
            ],
          }),
        );
      }
      throw new Error(url);
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Check now" }));
    expect(await screen.findByText("Incorrect prediction. -1 point.")).toBeInTheDocument();
    expectScore("-1");
  });

  it("explains a market data outage and a stale price", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/players")) {
        return jsonResponse({ token: "new-token", player: playerState() });
      }
      if (url.endsWith("/api/price")) {
        return jsonResponse(
          { error: { code: "PRICE_UNAVAILABLE", message: "Market data is temporarily unavailable." } },
          503,
        );
      }
      throw new Error(url);
    });

    const view = render(<App />);
    expect(await screen.findAllByText("Market data is temporarily unavailable.")).not.toHaveLength(0);
    view.unmount();

    installFetch((url) => {
      if (url.endsWith("/api/players")) {
        return jsonResponse({ token: "new-token", player: playerState() });
      }
      if (url.endsWith("/api/price")) return jsonResponse(priceState({ fresh: false }));
      throw new Error(url);
    });
    render(<App />);
    expect(await screen.findByText(/this price looks stale/i)).toBeInTheDocument();
  });

  it("explains a backend error with a retry", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/players")) {
        return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "nope" } }, 500);
      }
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      throw new Error(url);
    });

    render(<App />);
    expect(await screen.findByText(/could not load your session/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("loads a returning player instead of creating a new one", async () => {
    localStorage.setItem(PLAYER_TOKEN_KEY, "saved-token");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/api/me")) return Promise.resolve(jsonResponse(playerState({ score: 4 })));
      if (url.endsWith("/api/price")) return Promise.resolve(jsonResponse(priceState()));
      return Promise.reject(new Error(url));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expectScore("4");
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith("/api/players"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/api/me"))).toBe(true);
  });

  it("shows a duplicate guess error from the server", async () => {
    const user = userEvent.setup();
    installFetch((url) => {
      if (url.endsWith("/api/players")) {
        return jsonResponse({ token: "new-token", player: playerState() });
      }
      if (url.endsWith("/api/price")) return jsonResponse(priceState());
      if (url.endsWith("/api/guesses")) {
        return jsonResponse(
          {
            error: {
              code: "ACTIVE_GUESS_EXISTS",
              message: "You already have an active prediction.",
            },
          },
          409,
        );
      }
      throw new Error(url);
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Predict price will go up" }));
    expect(await screen.findByText("You already have an active prediction.")).toBeInTheDocument();
  });
});
