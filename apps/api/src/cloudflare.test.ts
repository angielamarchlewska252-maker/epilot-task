import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { WorkerEnv } from "./cloudflare.js";
import { sqlStatements } from "./persistence/sql-script.js";

describe("Cloudflare worker", () => {
  let dispose: () => Promise<void>;
  let env: WorkerEnv;
  let worker: {
    fetch(request: Request, env: WorkerEnv): Promise<Response>;
    scheduled(event: unknown, env: WorkerEnv): Promise<void>;
  };

  beforeAll(async () => {
    const imported = await import("./cloudflare.js");
    worker = imported.default;
    const proxy = await getPlatformProxy({
      configPath: "wrangler.jsonc",
      persist: false,
    });
    dispose = proxy.dispose;
    env = proxy.env as unknown as WorkerEnv;
    for (const statement of sqlStatements(readFileSync("migrations/0001_players.sql", "utf8"))) {
      await env.DB.prepare(statement).run();
    }
  }, 30_000);

  afterAll(async () => {
    await dispose();
  });

  it("serves health and does not expose the fake price route", async () => {
    const health = await worker.fetch(new Request("http://arena.test/api/health"), env);
    expect(health.status).toBe(200);
    expect((await health.json()).status).toBe("ok");
    const dev = await worker.fetch(
      new Request("http://arena.test/api/dev/quote", { method: "POST", body: "{}" }),
      env,
    );
    expect(dev.status).toBe(404);
  });

  it("returns the latest Coinbase BTC-USD trade from the worker route", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain("/products/BTC-USD/ticker");
      return new Response(
        JSON.stringify({ price: "83021.52", time: new Date().toISOString() }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("http://arena.test/api/price"), env);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.price).toBe("83021.52");
      expect(body.source).toBe("coinbase-exchange:BTC-USD");
      expect(body.fresh).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("runs the minute cron without scoring when nothing is due", async () => {
    await expect(worker.scheduled({ cron: "* * * * *" }, env)).resolves.toBeUndefined();
  });
});
