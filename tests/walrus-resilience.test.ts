import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/errors";
import { createWalrusClient } from "@/modules/memory/walrus.adapter";

/** A fake SDK whose reads can hang, fail or succeed, counting calls. */
function fakeSdk(mode: { recall: "hang" | "fail" | "ok" | "unauthorized" }) {
  const calls = { recall: 0, list: 0, remember: 0 };
  const sdk = {
    recall: async () => {
      calls.recall++;
      if (mode.recall === "hang") return new Promise(() => {});
      if (mode.recall === "fail") throw new Error('Walrus Memory server error (500): {"error":"Internal server error"}');
      if (mode.recall === "unauthorized") throw new Error("401 Unauthorized: invalid signature");
      return { results: [], total: 0 };
    },
    listMemories: async () => {
      calls.list++;
      return { memories: [], next_cursor: null, has_more: false };
    },
    health: async () => ({ status: "ok", version: "0.1.0" }),
    rememberAndWait: async () => {
      calls.remember++;
      return new Promise(() => {}); // writes are not bounded by the read timeout
    },
  };
  return { sdk: sdk as never, calls };
}

const CFG = { key: "k", accountId: "0x1", serverUrl: "https://relayer.example" };
const recall = (c: ReturnType<typeof createWalrusClient>) => c.recall({ query: "q", namespace: "n", limit: 1 });

describe("Walrus read resilience", () => {
  it("bounds a hanging read with its own timeout and reports it as unavailable", async () => {
    const { sdk } = fakeSdk({ recall: "hang" });
    const c = createWalrusClient(CFG, { sdk, readTimeoutMs: 30 });
    const started = Date.now();
    const err = await recall(c).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("opens the breaker after repeated relayer failures so later reads fail fast without calling the relayer", async () => {
    let now = 0;
    const { sdk, calls } = fakeSdk({ recall: "fail" });
    const c = createWalrusClient(CFG, { sdk, cooldownMs: 30_000, now: () => now });
    await expect(recall(c)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(recall(c)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" }); // 2nd consecutive failure opens it
    await expect(recall(c)).rejects.toThrow(/temporarily unavailable/);
    expect(calls.recall).toBe(2);
    now = 30_001; // cooldown elapsed: the relayer is tried again
    await expect(recall(c)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(calls.recall).toBe(3);
  });

  it("keeps recall failing fast even while listing succeeds (embedding outage pattern, walrus-memory#1285)", async () => {
    const { sdk, calls } = fakeSdk({ recall: "fail" });
    const client = createWalrusClient(CFG, { sdk });
    for (let i = 0; i < 2; i++) {
      await expect(recall(client)).rejects.toBeTruthy();
      await expect(client.listMemories({ namespace: "n" })).resolves.toBeTruthy(); // list success must not reset recall's breaker
    }
    await expect(recall(client)).rejects.toThrow(/recall is temporarily unavailable/);
    expect(calls.recall).toBe(2);
    expect(calls.list).toBe(2);
  });

  it("tolerates a single latency spike: one failure does not open the breaker", async () => {
    const { sdk, calls } = fakeSdk({ recall: "fail" });
    const c = createWalrusClient(CFG, { sdk });
    await expect(recall(c)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(c.listMemories({ namespace: "n" })).resolves.toBeTruthy();
    expect(calls.list).toBe(1);
  });

  it("does not open the breaker for credential errors", async () => {
    const { sdk, calls } = fakeSdk({ recall: "unauthorized" });
    const c = createWalrusClient(CFG, { sdk });
    await expect(recall(c)).rejects.toMatchObject({ code: "PROVIDER_UNAUTHORIZED" });
    await expect(c.listMemories({ namespace: "n" })).resolves.toBeTruthy();
    expect(calls.list).toBe(1);
  });

  it("never reports a failed read as an empty success", async () => {
    const { sdk } = fakeSdk({ recall: "fail" });
    const c = createWalrusClient(CFG, { sdk });
    const outcome = await recall(c).then(() => "resolved", () => "rejected");
    expect(outcome).toBe("rejected");
  });

  it("keeps writes on their own (longer) confirmation wait, not the read timeout", async () => {
    const { sdk, calls } = fakeSdk({ recall: "ok" });
    const c = createWalrusClient(CFG, { sdk, readTimeoutMs: 10 });
    const pending = c.rememberAndWait("t", "n", { idempotencyKey: "i" });
    const settled = await Promise.race([pending.then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("still waiting"), 50))]);
    expect(settled).toBe("still waiting");
    expect(calls.remember).toBe(1);
  });
});
