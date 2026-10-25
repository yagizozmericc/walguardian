import { describe, expect, it } from "vitest";
import { mapError } from "@/modules/memory/walrus.adapter";

describe("Walrus relayer error mapping", () => {
  it("treats relayer embedding failures as a retryable relayer outage, not bad credentials (walrus-memory#1286)", () => {
    const e = mapError(new Error('Internal Error: Embedding API error (401 Unauthorized): {"error":{"message":"User not found.","code":401}}'), "remember");
    expect(e).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
    expect(e.message).toMatch(/relayer side/);
  });

  it("treats relayer 500s on recall as retryable unavailability (walrus-memory#1285)", () => {
    const e = mapError(new Error('Walrus Memory server error (500): {"error":"Internal server error (traceId: x)"}'), "recall");
    expect(e).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
  });

  it("still reports genuine credential rejections and rate limits", () => {
    expect(mapError(new Error("401 Unauthorized: invalid signature"), "list").code).toBe("PROVIDER_UNAUTHORIZED");
    expect(mapError(new Error("429 Too Many Requests"), "recall")).toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true });
    expect(mapError(new Error("something else"), "list").code).toBe("PROVIDER_ERROR");
  });
});
