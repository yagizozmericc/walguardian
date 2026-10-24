import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { RateLimiter } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/request-guard";

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

describe("RateLimiter", () => {
  it("prunes idle keys without affecting active ones", () => {
    const l = new RateLimiter(1, 10);
    expect(l.check("a", 0).allowed).toBe(true);
    expect(l.check("a", 1).allowed).toBe(false);
    expect(l.check("a", 86_400_001).allowed).toBe(true);
  });
});
