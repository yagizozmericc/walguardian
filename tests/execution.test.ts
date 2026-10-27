import { describe, expect, it } from "vitest";
import { INSUFFICIENT_GAS_TITLE } from "@/modules/assessment/transfer.engine";
import type { Finding, TransferAssessment } from "@/modules/assessment/transfer.types";
import type { SimulationView } from "@/modules/execution/execution.types";
import { checkTransferIntent, labelBalanceChanges, signingPolicy, summarizeGas } from "@/modules/execution/simulation";
import { TICKET_TTL_MS, issueTicket, verifyTicket } from "@/modules/execution/ticket";
import { SUI_COIN_TYPE } from "@/modules/portfolio/assets";

/** FIXTURE-based tests: synthetic simulation outputs shaped like Tatum SimulateTransaction results. */

const SENDER = `0x${"1".repeat(64)}`;
const RECIPIENT = `0x${"2".repeat(64)}`;
const OTHER = `0x${"3".repeat(64)}`;
const USDC = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
const GAS = summarizeGas({ computationCost: "1000000", storageCost: "988000", storageRebate: "0" })!;

const changes = (list: [string, string, string][]) => labelBalanceChanges(list.map(([address, coinType, amount]) => ({ address, coinType, amount })), SENDER, RECIPIENT);
const intent = (coinType: string, amountRaw: bigint) => ({ sender: SENDER, recipient: RECIPIENT, coinType, amountRaw, suiCoinType: SUI_COIN_TYPE });

describe("summarizeGas", () => {
  it("nets rebates against costs", () => {
    expect(GAS.netMist).toBe("1988000");
    expect(summarizeGas({ computationCost: "1000", storageCost: "0", storageRebate: "5000" })!.netMist).toBe("-4000");
    expect(summarizeGas(undefined)).toBeNull();
  });
});

describe("checkTransferIntent", () => {
  it("accepts a SUI transfer matching amount plus gas (as simulated on Testnet)", () => {
    const c = changes([[SENDER, "0x2::sui::SUI", "-2988000"], [RECIPIENT, "0x2::sui::SUI", "1000000"]]);
    expect(c.map((x) => x.role)).toEqual(["sender", "recipient"]);
    expect(checkTransferIntent(c, GAS, intent(SUI_COIN_TYPE, 1_000_000n))).toEqual({ matches: true, issues: [] });
  });

  it("accepts a token transfer with gas paid in SUI", () => {
    const c = changes([[SENDER, USDC, "-5000000"], [RECIPIENT, USDC, "5000000"], [SENDER, SUI_COIN_TYPE, "-1988000"]]);
    expect(checkTransferIntent(c, GAS, intent(USDC, 5_000_000n)).matches).toBe(true);
  });

  it("flags a recipient amount that differs from the request", () => {
    const c = changes([[SENDER, SUI_COIN_TYPE, "-2988000"], [RECIPIENT, SUI_COIN_TYPE, "900000"], [OTHER, SUI_COIN_TYPE, "100000"]]);
    const r = checkTransferIntent(c, GAS, intent(SUI_COIN_TYPE, 1_000_000n));
    expect(r.matches).toBe(false);
    expect(r.issues.some((i) => i.includes("Recipient would receive 900000"))).toBe(true);
    expect(r.issues.some((i) => i.includes("unexpected address"))).toBe(true);
  });

  it("flags an unexpected asset leaving the sender", () => {
    const c = changes([[SENDER, SUI_COIN_TYPE, "-2988000"], [RECIPIENT, SUI_COIN_TYPE, "1000000"], [SENDER, USDC, "-1"]]);
    const r = checkTransferIntent(c, GAS, intent(SUI_COIN_TYPE, 1_000_000n));
    expect(r.matches).toBe(false);
    expect(r.issues).toContain(`An unexpected asset (${USDC}) would move.`);
  });

  it("does not confirm the outflow without a gas report", () => {
    const c = changes([[SENDER, SUI_COIN_TYPE, "-2988000"], [RECIPIENT, SUI_COIN_TYPE, "1000000"]]);
    expect(checkTransferIntent(c, null, intent(SUI_COIN_TYPE, 1_000_000n)).matches).toBe(false);
  });
});

const finding = (over: Partial<Finding>): Finding => ({ id: "F1", pillar: "protect", category: "pattern", level: "info", title: "t", detail: "d", ...over });

const assessment = (over: Partial<TransferAssessment> = {}): TransferAssessment =>
  ({
    verdict: "no_issues_found",
    verdictTitle: "No issues found in the available data",
    findings: [],
    protect: { score: 0, severity: "none" },
    ...over,
  }) as TransferAssessment;

const sim = (over: Partial<SimulationView> = {}): SimulationView => ({
  status: "success",
  error: null,
  gas: GAS,
  gasPaymentMocked: false,
  balanceChanges: [],
  intent: { matches: true, issues: [] },
  simulatedAt: "2026-10-27T00:00:00Z",
  source: { provider: "tatum", network: "testnet" },
  ...over,
});

describe("signingPolicy", () => {
  it("allows signing without acknowledgement when nothing is flagged", () => {
    expect(signingPolicy(assessment(), sim(), null)).toEqual({ allowed: true, requiresAcknowledgement: false, reasons: [] });
  });

  it("blocks on insufficient balance, build errors, failed or mocked simulations and intent mismatches", () => {
    expect(signingPolicy(assessment({ verdict: "insufficient_balance", verdictTitle: "Insufficient" }), null, null).allowed).toBe(false);
    expect(signingPolicy(assessment(), null, "Insufficient gas").reasons[0]).toContain("Insufficient gas");
    expect(signingPolicy(assessment(), sim({ status: "failed", error: "MoveAbort" }), null).allowed).toBe(false);
    expect(signingPolicy(assessment(), sim({ gasPaymentMocked: true }), null).allowed).toBe(false);
    expect(signingPolicy(assessment(), sim({ intent: { matches: false, issues: ["x"] } }), null).allowed).toBe(false);
    expect(signingPolicy(assessment(), null, null).reasons).toEqual(["No simulation is available."]);
  });

  it("requires acknowledgement for critical findings and high severity, never silently", () => {
    const a = assessment({
      verdict: "review_carefully",
      verdictTitle: "Review carefully before sending",
      findings: [finding({ level: "critical", title: "You flagged this recipient as suspicious", pillar: "memory" })],
      protect: { score: 70, severity: "high" } as TransferAssessment["protect"],
    });
    const p = signingPolicy(a, sim(), null);
    expect(p.allowed).toBe(true);
    expect(p.requiresAcknowledgement).toBe(true);
    expect(p.reasons).toEqual(["Review carefully before sending", "You flagged this recipient as suspicious", "Protect score 70/100 (high)."]);
  });

  it("lets a successful node simulation supersede the historical gas estimate", () => {
    const a = assessment({ verdict: "insufficient_gas", verdictTitle: INSUFFICIENT_GAS_TITLE, findings: [finding({ level: "critical", title: INSUFFICIENT_GAS_TITLE, pillar: "save", category: "fact" })] });
    expect(signingPolicy(a, sim(), null)).toEqual({ allowed: true, requiresAcknowledgement: false, reasons: [] });
  });
});

describe("transaction tickets", () => {
  const KEY = "test-key";
  const NOW = 1_800_000_000_000;

  it("verifies a ticket for the same digest and sender within the TTL", () => {
    const { ticket, expiresAtMs } = issueTicket(KEY, "DIGEST", SENDER, NOW);
    expect(expiresAtMs).toBe(NOW + TICKET_TTL_MS);
    expect(verifyTicket(KEY, ticket, "DIGEST", SENDER, NOW + 1000)).toEqual({ ok: true });
  });

  it("rejects other digests, senders, keys, expired and malformed tickets", () => {
    const { ticket } = issueTicket(KEY, "DIGEST", SENDER, NOW);
    expect(verifyTicket(KEY, ticket, "OTHER", SENDER, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyTicket(KEY, ticket, "DIGEST", RECIPIENT, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyTicket("other-key", ticket, "DIGEST", SENDER, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyTicket(KEY, ticket, "DIGEST", SENDER, NOW + TICKET_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(verifyTicket(KEY, "garbage", "DIGEST", SENDER, NOW)).toEqual({ ok: false, reason: "malformed" });
    const [exp, sig] = ticket.split(".");
    expect(verifyTicket(KEY, `${Number(exp) + 60_000}.${sig}`, "DIGEST", SENDER, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });
});
