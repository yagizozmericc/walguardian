import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "@/modules/blockchain/blockchain.types";
import { reconstructBalancesBefore, summarize } from "@/modules/security/security.service";
import type { AssessedTransaction, SecurityAssessment } from "@/modules/security/security.types";
import { SUI, WALLET } from "./fixtures/protect.fixture";

const OTHER = `0x${"cc".repeat(32)}`;
const ntx = (digest: string, amount: string): NormalizedTransaction => ({
  digest,
  checkpoint: null,
  timestampMs: null,
  sender: WALLET,
  kind: "programmable",
  success: true,
  gasFeeMist: "0",
  balanceChanges: [
    { address: WALLET, coinType: SUI, amount },
    { address: OTHER, coinType: SUI, amount: "999" },
  ],
  moveCalls: [],
});

describe("reconstructBalancesBefore", () => {
  it("walks back from current balances through newest-first history", () => {
    // Current 100. Newest tx: −30 (so 130 before it). Older tx: +50 (so 80 before it).
    const r = reconstructBalancesBefore(WALLET, [{ coinType: SUI, balance: "100" }], [ntx("new", "-30"), ntx("old", "50")]);
    expect(r.get("new")?.get(SUI)).toBe(130n);
    expect(r.get("old")?.get(SUI)).toBe(80n);
  });

  it("handles coins no longer held", () => {
    const r = reconstructBalancesBefore(WALLET, [], [ntx("spent", "-40")]);
    expect(r.get("spent")?.get(SUI)).toBe(40n);
  });

  it("marks the walk unreliable once it becomes inconsistent", () => {
    const r = reconstructBalancesBefore(WALLET, [{ coinType: SUI, balance: "10" }], [ntx("a", "50"), ntx("b", "-1")]);
    expect(r.get("a")).toBeNull(); // 10 − 50 < 0
    expect(r.get("b")).toBeNull(); // everything older is unreliable too
  });
});

const assessed = (severity: SecurityAssessment["severity"], critical = false): AssessedTransaction => ({
  digest: severity,
  timestampMs: 0,
  direction: "out",
  outflows: [],
  recipients: [],
  moveCalls: [],
  assessment: {
    score: 0,
    severity,
    confidence: "medium",
    signals: critical ? [{ rule: "LARGE_OUTFLOW", title: "", points: 40, critical: true, explanation: "", evidence: [] }] : [],
    limitations: [],
    notes: [],
    baselineSize: 10,
  },
});

describe("summarize", () => {
  it("reports insufficient history instead of 'no anomalies' when there is no transfer baseline", () => {
    expect(summarize([assessed("none"), assessed("none")], 0).status).toBe("insufficient_history");
    expect(summarize([], 0).status).toBe("insufficient_history");
  });

  it("still surfaces high findings when history is thin", () => {
    expect(summarize([assessed("high", true)], 0).status).toBe("attention_required");
  });

  it("distinguishes review from no anomalies, never claiming safety", () => {
    expect(summarize([assessed("medium")], 20).status).toBe("review_recommended");
    const none = summarize([assessed("low")], 20);
    expect(none.status).toBe("no_anomalies");
    expect(none.summary).toMatch(/not a guarantee/);
  });
});
