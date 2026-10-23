import { describe, expect, it } from "vitest";
import { candidateFromActivity } from "@/modules/security/anomaly.engine";
import { buildBaseline, percentile } from "@/modules/security/baseline.service";
import { assessCandidate, severityFor } from "@/modules/security/risk.engine";
import type { Candidate } from "@/modules/security/security.types";
import { assessHistory } from "@/modules/security/security.service";
import { DEX, HOUR, KNOWN, NEXT_T, STRANGER, SUI, SUI_UNIT, T0, UNKNOWN_PKG, balances, regularHistory, tx } from "./fixtures/protect.fixture";

const sui = (n: number) => BigInt(n) * SUI_UNIT;
const candidate = (over: Partial<Candidate> & { amount?: number }): Candidate => ({
  timestampMs: NEXT_T,
  outflows: [{ coinType: SUI, symbol: "SUI", decimals: 9, rawAmount: sui(over.amount ?? 10) }],
  recipients: [KNOWN[0]],
  packages: [],
  ...over,
});
const rules = (a: ReturnType<typeof assessCandidate>) => a.signals.map((s) => s.rule).sort();

describe("baseline", () => {
  it("computes nearest-rank percentiles on exact integers", () => {
    const sorted = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];
    expect(percentile(sorted, 50)).toBe(5n);
    expect(percentile(sorted, 90)).toBe(9n);
    expect(percentile(sorted, 95)).toBe(10n);
    expect(percentile([7n], 95)).toBe(7n);
  });

  it("profiles amounts, recipients, packages and frequency", () => {
    const b = buildBaseline(regularHistory());
    expect(b.outgoingTransferCount).toBe(20);
    expect(b.confidence).toBe("medium");
    expect(b.amountStats[0]).toMatchObject({ count: 20, median: sui(10).toString(), p95: sui(12).toString(), max: sui(12).toString() });
    expect(b.recipients.map((r) => r.address).sort()).toEqual([...KNOWN].sort());
    expect(b.recipientNoveltyRate).toBeCloseTo(3 / 20);
    expect(b.packages.map((p) => p.packageId)).toEqual([DEX]);
    expect(b.dailySentMean).toBeCloseTo(2, 0);
  });

  it("ignores failed and incoming transactions", () => {
    const b = buildBaseline([
      tx({ t: T0, out: [{ sui: 5 }], recipients: [KNOWN[0]], success: false }),
      tx({ t: T0 + HOUR, inbound: { sui: 50 }, isSender: false }),
    ]);
    expect(b.sentCount).toBe(0);
    expect(b.outgoingTransferCount).toBe(0);
  });
});

describe("anomaly scoring", () => {
  it("normal transaction: in-range amount to a known recipient scores 0", () => {
    const a = assessCandidate(candidate({}), regularHistory(), balances(1000));
    expect(a.score).toBe(0);
    expect(a.severity).toBe("none");
    expect(a.signals).toEqual([]);
    expect(a.confidence).toBe("medium");
  });

  it("unusually large transfer: scored against p95 with cited statistics", () => {
    const a = assessCandidate(candidate({ amount: 100 }), regularHistory(), balances(1000));
    expect(rules(a)).toEqual(["UNUSUAL_AMOUNT"]);
    const s = a.signals[0];
    expect(s.points).toBe(35); // 100 / 12 = 8.3× p95, above the 5× tier
    expect(s.critical).toBe(false); // known recipient
    expect(s.explanation).toContain("8.3×");
    expect(s.evidence.find((e) => e.label === "p95")?.value).toBe("12 SUI");
    expect(a.severity).toBe("medium");
  });

  it("amount just above p95 lands in the lowest tier", () => {
    const a = assessCandidate(candidate({ amount: 13 }), regularHistory(), balances(1000));
    expect(a.signals[0]).toMatchObject({ rule: "UNUSUAL_AMOUNT", points: 15 });
  });

  it("new recipient: scored and scaled by the wallet's own novelty rate", () => {
    const a = assessCandidate(candidate({ recipients: [STRANGER] }), regularHistory(), balances(1000));
    expect(rules(a)).toEqual(["NEW_RECIPIENT"]);
    expect(a.signals[0].points).toBe(17); // round(20 × (1 − 3/20))
    expect(a.severity).toBe("low");
  });

  it("new recipient is not scored for wallets that always pay new recipients", () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      tx({ t: T0 + i * 12 * HOUR, out: [{ sui: 1 }], recipients: [`0x${(i + 16).toString(16).repeat(32)}`] }),
    );
    const a = assessCandidate(candidate({ amount: 1, recipients: [STRANGER] }), history, balances(1000));
    expect(a.signals.find((s) => s.rule === "NEW_RECIPIENT")).toBeUndefined();
    expect(a.notes.join(" ")).toMatch(/100% of this wallet's prior transfers also went to new recipients/);
  });

  it("frequency spike: many sends within 24h versus a regular daily rate", () => {
    const burst = Array.from({ length: 9 }, (_, i) =>
      tx({ t: NEXT_T - (i + 1) * HOUR, out: [{ sui: 10 }], recipients: [KNOWN[1]] }),
    );
    const a = assessCandidate(candidate({}), [...regularHistory(), ...burst], balances(1000));
    const s = a.signals.find((x) => x.rule === "FREQUENCY_SPIKE");
    expect(s?.points).toBe(20);
    // 9 burst + 1 regular transaction in the window, plus the candidate itself (which has no digest yet).
    expect(s?.evidence[0].value).toBe("11");
    expect(s?.evidence[0].digests).toHaveLength(10);
  });

  it("large portfolio outflow: share of the balance held before the transaction", () => {
    const a = assessCandidate(candidate({ amount: 10 }), regularHistory(), balances(11));
    const s = a.signals.find((x) => x.rule === "LARGE_OUTFLOW");
    expect(s).toMatchObject({ points: 40, critical: true });
    expect(s?.evidence.find((e) => e.label === "Share")?.value).toBe("90%");
    expect(a.severity).toBe("high"); // critical forces high even though the score is 40
  });

  it("outflow tiers below critical", () => {
    expect(assessCandidate(candidate({ amount: 10 }), regularHistory(), balances(18)).signals[0]).toMatchObject({ rule: "LARGE_OUTFLOW", points: 30, critical: false });
    expect(assessCandidate(candidate({ amount: 10 }), regularHistory(), balances(35)).signals[0]).toMatchObject({ rule: "LARGE_OUTFLOW", points: 15 });
  });

  it("insufficient history: no guessing, explicit limitations, insufficient confidence", () => {
    const history = [tx({ t: T0, out: [{ sui: 1 }], recipients: [KNOWN[0]] }), tx({ t: T0 + HOUR, out: [{ sui: 2 }], recipients: [KNOWN[1]] })];
    const a = assessCandidate(candidate({ amount: 500, recipients: [STRANGER], packages: [UNKNOWN_PKG] }), history, null);
    expect(a.signals).toEqual([]);
    expect(a.score).toBe(0);
    expect(a.confidence).toBe("insufficient");
    expect(a.limitations.map((l) => l.rule).sort()).toEqual(["FREQUENCY_SPIKE", "LARGE_OUTFLOW", "NEW_PACKAGE", "NEW_RECIPIENT", "UNUSUAL_AMOUNT"]);
  });

  it("large outflow is still detected for a wallet with no history", () => {
    const a = assessCandidate(candidate({ amount: 95 }), [], balances(100));
    expect(rules(a)).toEqual(["LARGE_OUTFLOW"]);
    expect(a.severity).toBe("high");
    expect(a.confidence).toBe("insufficient");
  });

  it("multiple simultaneous signals: summed, capped at 100, critical combination", () => {
    const a = assessCandidate(
      candidate({ amount: 100, recipients: [STRANGER], packages: [UNKNOWN_PKG] }),
      regularHistory(),
      balances(105),
    );
    expect(rules(a)).toEqual(["LARGE_OUTFLOW", "NEW_PACKAGE", "NEW_RECIPIENT", "UNUSUAL_AMOUNT"]);
    expect(a.score).toBe(100); // 40 + 35 + 17 + 15 = 107, capped
    expect(a.signals.find((s) => s.rule === "UNUSUAL_AMOUNT")?.critical).toBe(true);
    expect(a.severity).toBe("high");
    expect(a.signals[0].points).toBeGreaterThanOrEqual(a.signals[1].points); // ordered by contribution
  });

  it("first outgoing transfer of a new asset", () => {
    const usdc = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
    const a = assessCandidate(
      candidate({ outflows: [{ coinType: usdc, symbol: "USDC", decimals: 6, rawAmount: 5_000_000n }] }),
      regularHistory(),
      new Map([[usdc, 100_000_000n]]),
    );
    expect(rules(a)).toEqual(["NEW_ASSET"]);
    expect(a.limitations.map((l) => l.rule)).toContain("UNUSUAL_AMOUNT"); // no USDC distribution yet
  });

  it("is deterministic", () => {
    const c = candidate({ amount: 100, recipients: [STRANGER] });
    expect(assessCandidate(c, regularHistory(), balances(500))).toEqual(assessCandidate(c, regularHistory(), balances(500)));
  });

  it("never describes anomalies as attacks or confirmed malicious activity", () => {
    const a = assessCandidate(candidate({ amount: 100, recipients: [STRANGER], packages: [UNKNOWN_PKG] }), regularHistory(), balances(105));
    const text = [...a.signals.flatMap((s) => [s.title, s.explanation]), ...a.notes].join(" ").toLowerCase();
    expect(text).not.toMatch(/malicious|attack|scam|hack|stolen|fraud/);
  });
});

describe("historical assessment", () => {
  it("scores each transaction only against history before it", () => {
    const history = [...regularHistory(), tx({ t: NEXT_T, out: [{ sui: 100 }], recipients: [STRANGER], digest: "FIXTURE-outlier" })];
    const assessed = assessHistory(history, new Map());
    expect(assessed[0].digest).toBe("FIXTURE-outlier");
    expect(assessed[0].assessment.baselineSize).toBe(20); // not including itself
    // The very first transaction has no history at all.
    const first = assessed.find((a) => a.digest === "FIXTURE-regular-0");
    expect(first?.assessment.confidence).toBe("insufficient");
    expect(first?.assessment.baselineSize).toBe(0);
  });

  it("only assesses successful transactions sent by the wallet", () => {
    const assessed = assessHistory(
      [tx({ t: T0, inbound: { sui: 5 }, isSender: false }), tx({ t: T0 + HOUR, out: [{ sui: 1 }], success: false })],
      new Map(),
    );
    expect(assessed).toEqual([]);
  });

  it("candidate extraction excludes gas-only interactions from outflows", () => {
    const c = candidateFromActivity(tx({ t: T0, packages: [DEX] }));
    expect(c?.outflows).toEqual([]);
    expect(c?.packages).toEqual([DEX]);
  });
});

describe("severityFor", () => {
  it("maps scores to severities; critical forces high", () => {
    expect(severityFor(0, false)).toBe("none");
    expect(severityFor(10, false)).toBe("low");
    expect(severityFor(30, false)).toBe("medium");
    expect(severityFor(60, false)).toBe("high");
    expect(severityFor(5, true)).toBe("high");
  });
});
