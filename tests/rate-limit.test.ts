import { describe, expect, it } from "vitest";
import { MemoryKvStore } from "@/lib/kv";
import { consumeLimits } from "@/lib/rate-limit";

const T0 = Date.UTC(2026, 9, 25, 12, 0, 10); // 10 s into a minute

describe("consumeLimits (fixed windows on a shared store)", () => {
  it("allows up to the per-minute budget, then denies until the next minute", async () => {
    const store = new MemoryKvStore(() => T0);
    const rules = [{ id: "s:a", perMinute: 2, perDay: 100 }];
    expect((await consumeLimits(store, "api", rules, T0)).allowed).toBe(true);
    expect((await consumeLimits(store, "api", rules, T0)).allowed).toBe(true);
    const denied = await consumeLimits(store, "api", rules, T0);
    expect(denied).toEqual({ allowed: false, reason: "limit of 2 requests per minute reached", retryAfterS: 50 });
    expect((await consumeLimits(store, "api", rules, T0 + 50_000)).allowed).toBe(true);
  });

  it("enforces the daily budget across minutes", async () => {
    let now = T0;
    const store = new MemoryKvStore(() => now);
    const rules = [{ id: "s:a", perMinute: 10, perDay: 3 }];
    for (let i = 0; i < 3; i++, now += 60_000) expect((await consumeLimits(store, "api", rules, now)).allowed).toBe(true);
    const r = await consumeLimits(store, "api", rules, now);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/daily limit of 3/);
  });

  it("denies when any rule is exhausted (session or IP)", async () => {
    const store = new MemoryKvStore(() => T0);
    // Two sessions behind one IP whose budget is 3 per minute.
    const a = [{ id: "s:a", perMinute: 2, perDay: 100 }, { id: "ip:x", perMinute: 3, perDay: 100 }];
    const b = [{ id: "s:b", perMinute: 2, perDay: 100 }, { id: "ip:x", perMinute: 3, perDay: 100 }];
    expect((await consumeLimits(store, "api", a, T0)).allowed).toBe(true);
    expect((await consumeLimits(store, "api", a, T0)).allowed).toBe(true);
    expect((await consumeLimits(store, "api", b, T0)).allowed).toBe(true);
    expect((await consumeLimits(store, "api", b, T0)).allowed).toBe(false); // IP budget spent
  });

  it("shares one budget between callers using the same store (all instances agree)", async () => {
    const store = new MemoryKvStore(() => T0);
    const rules = [{ id: "s:a", perMinute: 1, perDay: 100 }];
    expect((await consumeLimits(store, "api", rules, T0)).allowed).toBe(true);
    expect((await consumeLimits(store, "api", rules, T0 + 1)).allowed).toBe(false);
  });

  it("keeps buckets independent", async () => {
    const store = new MemoryKvStore(() => T0);
    const rules = [{ id: "s:a", perMinute: 1, perDay: 100 }];
    expect((await consumeLimits(store, "tatum", rules, T0)).allowed).toBe(true);
    expect((await consumeLimits(store, "copilot", rules, T0)).allowed).toBe(true);
  });
});

describe("MemoryKvStore", () => {
  it("expires values after their TTL and round-trips JSON", async () => {
    let now = 0;
    const s = new MemoryKvStore(() => now);
    await s.set("k", { a: 1, d: new Date(0) }, 10);
    expect(await s.get("k")).toEqual({ a: 1, d: "1970-01-01T00:00:00.000Z" });
    now = 10_000;
    expect(await s.get("k")).toBeNull();
    expect(await s.incr([{ key: "c", ttlS: 1 }, { key: "c", ttlS: 1 }])).toEqual([1, 2]);
  });
});
