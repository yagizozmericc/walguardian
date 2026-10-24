import { describe, expect, it } from "vitest";
import { assessCandidate } from "@/modules/security/risk.engine";
import { assessHistory, openTransactions, summarize } from "@/modules/security/security.service";
import type { Candidate, FeedbackKnowledge } from "@/modules/security/security.types";
import { HOUR, KNOWN, NEXT_T, STRANGER, SUI, SUI_UNIT, UNKNOWN_PKG, balances, regularHistory, tx } from "./fixtures/protect.fixture";

const candidate = (amount: number, recipient: string, packages: string[] = [], digest?: string): Candidate => ({
  digest,
  timestampMs: NEXT_T,
  outflows: [{ coinType: SUI, symbol: "SUI", decimals: 9, rawAmount: BigInt(amount) * SUI_UNIT }],
  recipients: [recipient],
  packages,
});
const review = (over: Partial<FeedbackKnowledge>): FeedbackKnowledge => ({
  digest: "FIXTURE-earlier",
  verdict: "expected",
  note: "Quarterly transfer to my cold wallet",
  recipients: [STRANGER],
  packages: [],
  transactionTimeMs: NEXT_T - 24 * HOUR,
  memoryId: "mem-1234567890",
  createdAt: "2026-10-24T10:00:00.000Z",
  ...over,
});
const rules = (a: ReturnType<typeof assessCandidate>) => a.signals.map((s) => s.rule).sort();

describe("memory changes later assessments", () => {
  it("a recipient you marked as expected is no longer scored as new", () => {
    const without = assessCandidate(candidate(10, STRANGER), regularHistory(), balances(1000));
    expect(rules(without)).toEqual(["NEW_RECIPIENT"]);
    const withMemory = assessCandidate(candidate(10, STRANGER), regularHistory(), balances(1000), [review({})]);
    expect(withMemory.signals).toEqual([]);
    expect(withMemory.notes.join(" ")).toMatch(/you marked an earlier transfer to it .* as expected \("Quarterly transfer to my cold wallet"\)\. Memory mem-1234/);
  });

  it("packages from an expected transaction are not scored as new", () => {
    const a = assessCandidate(candidate(10, KNOWN[0], [UNKNOWN_PKG]), regularHistory(), balances(1000), [review({ packages: [UNKNOWN_PKG] })]);
    expect(rules(a)).toEqual([]);
  });

  it("a recipient you marked as suspicious raises a critical signal", () => {
    const a = assessCandidate(candidate(10, STRANGER), regularHistory(), balances(1000), [review({ verdict: "suspicious", note: "Unknown address" })]);
    const s = a.signals.find((x) => x.rule === "USER_FLAGGED_RECIPIENT");
    expect(s).toMatchObject({ critical: true, points: 30 });
    expect(s?.explanation).toMatch(/your own assessment from memory, not independent evidence/);
    expect(a.severity).toBe("high");
  });

  it("only reviews of earlier transactions apply (not the transaction itself, not later ones)", () => {
    const self = assessCandidate(candidate(10, STRANGER, [], "FIXTURE-self"), regularHistory(), balances(1000), [review({ digest: "FIXTURE-self" })]);
    expect(rules(self)).toEqual(["NEW_RECIPIENT"]);
    const later = assessCandidate(candidate(10, STRANGER), regularHistory(), balances(1000), [review({ transactionTimeMs: NEXT_T + HOUR })]);
    expect(rules(later)).toEqual(["NEW_RECIPIENT"]);
  });

  it("'not sure' reviews do not change scoring", () => {
    const a = assessCandidate(candidate(10, STRANGER), regularHistory(), balances(1000), [review({ verdict: "unsure" })]);
    expect(rules(a)).toEqual(["NEW_RECIPIENT"]);
  });
});

describe("critical signals are never suppressed by feedback", () => {
  it("large outflow and the large-amount-to-new-recipient combination stay critical after an 'expected' review", () => {
    const a = assessCandidate(candidate(100, STRANGER), regularHistory(), balances(105), [review({})]);
    expect(a.signals.find((s) => s.rule === "LARGE_OUTFLOW")?.critical).toBe(true);
    // The recipient is new in onchain history; trusting it removes only the non-critical NEW_RECIPIENT points.
    expect(a.signals.find((s) => s.rule === "UNUSUAL_AMOUNT")?.critical).toBe(true);
    expect(a.signals.find((s) => s.rule === "NEW_RECIPIENT")).toBeUndefined();
    expect(a.severity).toBe("high");
  });

  it("a reviewed critical transaction stays open and flagged; a reviewed non-critical one is closed", () => {
    const history = [
      ...regularHistory(),
      tx({ t: NEXT_T, out: [{ sui: 10 }], recipients: [STRANGER], digest: "FIXTURE-small-new" }),
    ];
    const reviewed = [review({ digest: "FIXTURE-small-new", transactionTimeMs: NEXT_T })];
    const assessed = assessHistory(history, new Map([["FIXTURE-small-new", balances(1000)]]), reviewed);
    const small = assessed.find((a) => a.digest === "FIXTURE-small-new")!;
    expect(small.review).toMatchObject({ verdict: "expected", remainsFlagged: false });
    expect(openTransactions(assessed).some((a) => a.digest === "FIXTURE-small-new")).toBe(false);

    const critical = [...regularHistory(), tx({ t: NEXT_T, out: [{ sui: 100 }], recipients: [STRANGER], digest: "FIXTURE-drain" })];
    const assessed2 = assessHistory(critical, new Map([["FIXTURE-drain", balances(105)]]), [review({ digest: "FIXTURE-drain", transactionTimeMs: NEXT_T })]);
    const drain = assessed2.find((a) => a.digest === "FIXTURE-drain")!;
    expect(drain.review?.remainsFlagged).toBe(true);
    expect(drain.assessment.severity).toBe("high");
    expect(openTransactions(assessed2).some((a) => a.digest === "FIXTURE-drain")).toBe(true);
    expect(summarize(assessed2, 20).status).toBe("attention_required");
  });
});
