import { describe, expect, it } from "vitest";
import { redact } from "@/lib/logger";

describe("redact", () => {
  it("removes secret-looking fields at any depth", () => {
    expect(
      redact({ apiKey: "k", nested: { privateKey: "p", ok: 1 }, list: [{ token: "t" }] }),
    ).toEqual({ apiKey: "[redacted]", nested: { privateKey: "[redacted]", ok: 1 }, list: [{ token: "[redacted]" }] });
  });
});
