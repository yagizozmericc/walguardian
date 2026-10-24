import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mapGeminiError } from "@/modules/ai/gemini.provider";

const KEY = "test-key-should-never-appear";
const scrub = (s: string) => s.split(KEY).join("[redacted]");
const apiErr = (status: number, message = "x") => new ApiError({ status, message });

describe("mapGeminiError", () => {
  it.each([
    [401, "PROVIDER_UNAUTHORIZED", false],
    [403, "PROVIDER_UNAUTHORIZED", false],
    [429, "PROVIDER_RATE_LIMITED", true],
    [404, "PROVIDER_UNSUPPORTED", false],
    [500, "PROVIDER_UNAVAILABLE", true],
    [504, "PROVIDER_UNAVAILABLE", true],
    [400, "PROVIDER_ERROR", false],
  ] as const)("HTTP %s → %s", (status, code, retryable) => {
    const e = mapGeminiError(apiErr(status), scrub);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(retryable);
    expect(e.provider).toBe("llm");
  });

  it("never echoes the API key in messages", () => {
    const e = mapGeminiError(apiErr(400, `bad request for key=${KEY}`), scrub);
    expect(e.message).not.toContain(KEY);
    expect(e.message).toContain("[redacted]");
  });

  it("treats network timeouts as unavailable", () => {
    expect(mapGeminiError(new Error("fetch failed"), scrub).code).toBe("PROVIDER_UNAVAILABLE");
  });
});
