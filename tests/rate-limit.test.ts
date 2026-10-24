import { describe, expect, it } from "vitest";
import { CopilotRateLimiter } from "@/modules/ai/rate-limit";

describe("CopilotRateLimiter", () => {
  it("enforces per-minute and per-day limits per key", () => {
    const l = new CopilotRateLimiter(2, 3);
    const t = 1_000_000;
    expect(l.check("a", t).allowed).toBe(true);
    expect(l.check("a", t + 1).allowed).toBe(true);
    const third = l.check("a", t + 2);
    expect(third).toMatchObject({ allowed: false });
    expect(l.check("b", t + 2).allowed).toBe(true); // other keys unaffected
    expect(l.check("a", t + 61_000).allowed).toBe(true); // minute window passed
    expect(l.check("a", t + 122_000)).toMatchObject({ allowed: false, reason: expect.stringContaining("daily") });
  });
});
