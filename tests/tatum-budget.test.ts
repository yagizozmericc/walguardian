import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/errors";
import { MemoryKvStore, type KvStore } from "@/lib/kv";
import { SharedRequestBudget } from "@/modules/blockchain/tatum.budget";

function clock(start: number) {
  let now = start;
  return { now: () => now, sleep: async (ms: number) => void (now += ms) };
}

describe("SharedRequestBudget (global Tatum requests per second)", () => {
  it("admits up to the limit per second across all callers, then waits for the next second", async () => {
    const c = clock(10_000_200);
    const store = new MemoryKvStore(c.now);
    const a = new SharedRequestBudget(() => ({ store, shared: true }), 3, c);
    const b = new SharedRequestBudget(() => ({ store, shared: true }), 3, c); // another instance
    await a.acquire();
    await b.acquire();
    await a.acquire();
    const before = c.now();
    await b.acquire(); // 4th request in the same second
    expect(Math.floor(c.now() / 1000)).toBe(Math.floor(before / 1000) + 1);
  });

  it("gives up with a retryable rate-limit error instead of waiting unboundedly", async () => {
    const c = clock(20_000_000);
    const store = new MemoryKvStore(c.now);
    const budget = new SharedRequestBudget(() => ({ store, shared: true }), 1, { ...c, maxWaitMs: 500 });
    await budget.acquire();
    const err = await budget.acquire().catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true });
  });

  it("is skipped without a shared store (the per-instance spacer applies)", async () => {
    const failingIfUsed: KvStore = { incr: () => Promise.reject(new Error("unused")), get: async () => null, set: async () => {}, ping: async () => {} };
    await expect(new SharedRequestBudget(() => ({ store: failingIfUsed, shared: false }), 1).acquire()).resolves.toBeUndefined();
  });

  it("falls back to the per-instance spacer when Redis fails", async () => {
    const down: KvStore = { incr: () => Promise.reject(new Error("down")), get: async () => null, set: async () => {}, ping: async () => {} };
    await expect(new SharedRequestBudget(() => ({ store: down, shared: true }), 1).acquire()).resolves.toBeUndefined();
  });
});
