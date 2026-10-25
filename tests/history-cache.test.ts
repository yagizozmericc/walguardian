import { afterEach, describe, expect, it, vi } from "vitest";
import type { KvStore } from "@/lib/kv";

/**
 * Shared (Redis) history cache: a second instance reuses a recent load,
 * `fresh` bypasses it, and cache failures never fail a request.
 */

const ADDRESS = "0x" + "ab".repeat(32);

function fakeProvider() {
  const calls = { list: 0 };
  const provider = {
    assertNetwork: async () => ({ chainId: "4c78adac", chain: "testnet", epoch: "1", checkpointHeight: "1", lowestAvailableCheckpoint: "0" }),
    getTransactions: async () => {
      calls.list++;
      return { transactions: [], nextCursor: null };
    },
    getBalances: async () => [{ coinType: "0x2::sui::SUI", balance: "5" }],
    getCoinMetadata: async () => ({ coinType: "0x2::sui::SUI", symbol: "SUI", name: "Sui", decimals: 9 }),
    source: () => ({ provider: "tatum", transport: "grpc", network: "testnet", endpoint: "test", fetchedAt: "2026-10-25T00:00:00.000Z" }),
  };
  return { provider, calls };
}

/** A fresh module graph = a new server instance (empty in-process cache), sharing `store`. */
async function instance(store: KvStore) {
  vi.resetModules();
  const kv = await import("@/lib/kv");
  kv.setKvForTests({ store, shared: true });
  return import("@/modules/portfolio/history.service");
}

afterEach(() => vi.resetModules());

describe("shared history cache", () => {
  it("lets a second instance reuse a recent load (compressed in the store)", async () => {
    const { MemoryKvStore } = await import("@/lib/kv");
    const store = new MemoryKvStore();
    const a = fakeProvider();
    const first = await (await instance(store)).getAddressHistory(a.provider as never, ADDRESS);
    const packed = await store.get<string>(`hist:v1:${ADDRESS}:200`);
    expect(typeof packed).toBe("string");

    const b = fakeProvider();
    const second = await (await instance(store)).getAddressHistory(b.provider as never, ADDRESS);
    expect(b.calls.list).toBe(0);
    expect(second).toEqual(first);
    expect(second.source.fetchedAt).toBe("2026-10-25T00:00:00.000Z"); // original fetch time preserved
  });

  it("bypasses the shared cache on an explicit refresh", async () => {
    const { MemoryKvStore } = await import("@/lib/kv");
    const store = new MemoryKvStore();
    await (await instance(store)).getAddressHistory(fakeProvider().provider as never, ADDRESS);
    const b = fakeProvider();
    await (await instance(store)).getAddressHistory(b.provider as never, ADDRESS, { fresh: true });
    expect(b.calls.list).toBeGreaterThan(0);
  });

  it("still serves data when Redis fails", async () => {
    const down: KvStore = {
      incr: () => Promise.reject(new Error("down")),
      get: () => Promise.reject(new Error("down")),
      set: () => Promise.reject(new Error("down")),
      ping: () => Promise.reject(new Error("down")),
    };
    const p = fakeProvider();
    const h = await (await instance(down)).getAddressHistory(p.provider as never, ADDRESS);
    expect(h.balances).toHaveLength(1);
    expect(p.calls.list).toBeGreaterThan(0);
  });
});
