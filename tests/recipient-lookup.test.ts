import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/errors";
import { lookupRecipient } from "@/modules/assessment/recipient";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";

const fake = (impl: () => Promise<unknown>) => ({ getTransactions: vi.fn(impl) }) as unknown as SuiTatumProvider & { getTransactions: ReturnType<typeof vi.fn> };
const addr = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

describe("lookupRecipient", () => {
  it("reports activity and caches the result", async () => {
    const p = fake(async () => ({ transactions: Array.from({ length: 5 }, (_, i) => ({ timestampMs: 1000 - i })), nextCursor: "c", endReason: null }));
    const a = await lookupRecipient(p, addr(1), 0);
    expect(a).toEqual({ status: "active", recentTransactions: 5, atLeast: true, lastActivityMs: 1000 });
    await lookupRecipient(p, addr(1), 1000);
    expect(p.getTransactions).toHaveBeenCalledTimes(1);
  });

  it("reports no activity without implying safety", async () => {
    expect(await lookupRecipient(fake(async () => ({ transactions: [], nextCursor: null, endReason: null })), addr(2), 0)).toEqual({ status: "no_activity" });
  });

  it("never throws: provider errors become 'unavailable' and are retried soon", async () => {
    const p = fake(async () => {
      throw new ProviderError("tatum", "PROVIDER_RATE_LIMITED", "Tatum rate limit reached.", true);
    });
    expect(await lookupRecipient(p, addr(3), 0)).toEqual({ status: "unavailable", reason: "Tatum rate limit reached." });
    await lookupRecipient(p, addr(3), 31_000);
    expect(p.getTransactions).toHaveBeenCalledTimes(2);
  });

  it("times out instead of hanging", async () => {
    vi.useFakeTimers();
    const pending = lookupRecipient(fake(() => new Promise(() => {})), addr(4), 0);
    await vi.advanceTimersByTimeAsync(6_001);
    expect(await pending).toEqual({ status: "unavailable", reason: "the lookup timed out" });
    vi.useRealTimers();
  });
});
