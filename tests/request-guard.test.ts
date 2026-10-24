import { afterEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { MemoryKvStore, setKvForTests, type KvStore } from "@/lib/kv";
import { limit, readJsonBody } from "@/lib/request-guard";

const req = (body: string, type = "application/json") => new Request("http://x/api", { method: "POST", body, headers: { "content-type": type } });

describe("readJsonBody", () => {
  it("accepts JSON bodies within the limit", async () => {
    expect(await readJsonBody(req('{"a":1}'), 100)).toEqual({ a: 1 });
    expect(await readJsonBody(req('{"a":1}', "application/json; charset=utf-8"), 100)).toEqual({ a: 1 });
  });
  it("rejects non-JSON content types (blocks simple cross-site form posts)", async () => {
    await expect(readJsonBody(req('{"a":1}', "text/plain"), 100)).rejects.toBeInstanceOf(ValidationError);
    await expect(readJsonBody(req("a=1", "application/x-www-form-urlencoded"), 100)).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects oversized and malformed bodies", async () => {
    await expect(readJsonBody(req(JSON.stringify({ x: "y".repeat(200) })), 100)).rejects.toThrow(/too large/);
    await expect(readJsonBody(req("{not json"), 100)).rejects.toThrow(/must be JSON/);
  });
});

const failing: KvStore = {
  incr: () => Promise.reject(new Error("redis down")),
  get: () => Promise.reject(new Error("redis down")),
  set: () => Promise.reject(new Error("redis down")),
  ping: () => Promise.reject(new Error("redis down")),
};

describe("limit() during a Redis outage", () => {
  afterEach(() => setKvForTests(null));
  const rules = [{ id: "s:a", perMinute: 6, perDay: 30 }];

  it("denies paid or write operations (deny policy)", async () => {
    setKvForTests({ store: failing, shared: true });
    const r = await limit("copilot", rules, "deny");
    expect(r).toMatchObject({ allowed: false, unavailable: true });
  });

  it("degrades reads to a stricter per-instance budget (a third of normal)", async () => {
    setKvForTests({ store: failing, shared: true });
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await limit("tatum", rules, "degrade")).allowed);
    expect(results).toEqual([true, true, false]); // 6 / 3 = 2 per minute
  });

  it("uses the shared store when it is healthy", async () => {
    const store = new MemoryKvStore();
    setKvForTests({ store, shared: true });
    for (let i = 0; i < 6; i++) expect((await limit("tatum", rules, "degrade")).allowed).toBe(true);
    expect((await limit("tatum", rules, "degrade")).allowed).toBe(false);
  });
});
