import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { afterAll, describe, expect, it } from "vitest";
import { UpstashKvStore } from "@/lib/kv";
import { consumeLimits } from "@/lib/rate-limit";

/**
 * Live checks against the configured Upstash database (KV_REST_API_URL /
 * KV_REST_API_TOKEN). Keys use an isolated, random `wg:test:` prefix and are
 * deleted afterwards. Skipped when the credentials are not set.
 */
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const live = Boolean(url && token);
const prefix = `wg:test:${randomUUID().slice(0, 8)}:`;

describe.skipIf(!live)("Upstash Redis (live)", () => {
  const store = live ? new UpstashKvStore({ url: url!, token: token! }, prefix) : null!;
  const admin = live ? new Redis({ url: url!, token: token!, enableTelemetry: false }) : null!;

  afterAll(async () => {
    if (!live) return;
    const keys = await admin.keys(`${prefix}*`);
    if (keys.length) await admin.del(...keys);
    expect(await admin.keys(`${prefix}*`)).toEqual([]);
  });

  it("answers PING", async () => {
    await expect(store.ping()).resolves.toBeUndefined();
  });

  it("increments counters atomically in one pipeline and applies TTLs under the prefix", async () => {
    expect(await store.incr([{ key: "c1", ttlS: 30 }, { key: "c1", ttlS: 30 }, { key: "c2", ttlS: 30 }])).toEqual([1, 2, 1]);
    const ttl = await admin.ttl(`${prefix}c1`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
    expect(await admin.exists("c1")).toBe(0); // nothing written outside the prefix
  });

  it("round-trips JSON values with expiry", async () => {
    await store.set("json", { a: 1, list: ["x"] }, 30);
    expect(await store.get("json")).toEqual({ a: 1, list: ["x"] });
    expect(await store.get("missing")).toBeNull();
  });

  it("enforces a shared fixed-window budget across separate clients", async () => {
    const other = new UpstashKvStore({ url: url!, token: token! }, prefix); // a second "instance"
    const rules = [{ id: "s:test", perMinute: 2, perDay: 100 }];
    const now = Date.now();
    expect((await consumeLimits(store, "it", rules, now)).allowed).toBe(true);
    expect((await consumeLimits(other, "it", rules, now)).allowed).toBe(true);
    expect((await consumeLimits(store, "it", rules, now)).allowed).toBe(false);
  });

  it("fails fast with an error on bad credentials (callers apply the outage policy)", async () => {
    const bad = new UpstashKvStore({ url: url!, token: "invalid-token" }, prefix);
    await expect(bad.ping()).rejects.toThrow();
  });
});
