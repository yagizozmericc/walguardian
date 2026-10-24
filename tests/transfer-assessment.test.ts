import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseUnits } from "@/lib/units";
import { DISCLAIMER, assessTransfer, computeSpendable, estimateGas, type AssessmentInput } from "@/modules/assessment/transfer.engine";
import type { EnginePrice } from "@/modules/strategy/allocation.engine";
import type { FeedbackKnowledge } from "@/modules/security/security.types";
import { HOUR, KNOWN, NEXT_T, STRANGER, SUI, WALLET, regularHistory } from "./fixtures/protect.fixture";
import { goal } from "./fixtures/savings.fixture";
import { settings } from "./fixtures/strategy.fixture";

/** FIXTURE-based tests: synthetic wallet history (20 transfers of 8–12 SUI to 3 known recipients, gas 0.001 SUI each). */

const USDC = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
const sui = (n: string) => parseUnits(n, 9);
const usdc = (n: string) => parseUnits(n, 6);
const price = (v: string): EnginePrice => ({ priceE8: parseUnits(v, 8), value: v, basis: "user_reference", asOf: "2026-10-24" });
const SUI_ASSET = { coinType: SUI, symbol: "SUI", decimals: 9, assetClass: "native" as const };
const USDC_ASSET = { coinType: USDC, symbol: "USDC", decimals: 6, assetClass: "stablecoin" as const };

const input = (over: Partial<AssessmentInput> = {}): AssessmentInput => {
  const balances = over.balances ?? new Map([[SUI, sui("1000")]]);
  return {
    wallet: WALLET,
    recipient: KNOWN[0],
    asset: SUI_ASSET,
    amountRaw: sui("10"),
    nowMs: NEXT_T,
    asOf: "2026-10-24",
    suiCoinType: SUI,
    balances,
    holdings: [...balances.keys()].map((c) => ({ coinType: c, symbol: c === SUI ? "SUI" : "USDC", decimals: c === SUI ? 9 : 6, assetClass: c === SUI ? "native" : "stablecoin", rawBalance: balances.get(c)! })),
    history: regularHistory(),
    gas: estimateGas(regularHistory()),
    recipientLookup: { status: "active", recentTransactions: 5, atLeast: true, lastActivityMs: NEXT_T - HOUR },
    lowestAvailableCheckpoint: "314252673",
    goals: [],
    settings: null,
    prices: new Map([[SUI, price("2")], [USDC, price("1")]]),
    defaultBuyAssets: {},
    memory: { status: "applied", detail: "ok", feedback: [], pastChecks: [], decisions: [], notes: [] },
    walletCriticals: [],
    ...over,
  };
};
const titles = (r: ReturnType<typeof assessTransfer>) => r.findings.map((f) => f.title);
const review = (verdict: FeedbackKnowledge["verdict"], recipient = STRANGER): FeedbackKnowledge => ({
  digest: "FIXTURE-earlier-review", verdict, note: "synthetic note", recipients: [recipient], packages: [], transactionTimeMs: NEXT_T - 24 * HOUR, memoryId: "mem-1", createdAt: "2026-10-23T10:00:00.000Z",
});

describe("gas estimate", () => {
  it("is the median of past successful sent transactions, labelled as historical", () => {
    expect(estimateGas(regularHistory())).toEqual({ estimateMist: "1000000", samples: 20, basis: "historical_median" });
    expect(estimateGas([]).estimateMist).toBeNull();
  });
});

describe("normal transfer", () => {
  it("in-range amount to a known recipient: no issues found, but never called safe", () => {
    const r = assessTransfer(input());
    expect(r.verdict).toBe("no_issues_found");
    expect(r.verdictTitle).toBe("No issues found in the available data");
    expect(r.verdictSummary).toMatch(/does not mean the transfer or recipient is safe/);
    expect(r.protect.signals).toEqual([]);
    expect(r.save).toMatchObject({ status: "computed", balanceBefore: "1000", balanceAfter: "990", suiAfterEstimated: "989.999" });
    expect(DISCLAIMER).toMatch(/Simulation only: nothing was signed or sent/);
  });
});

describe("balance and gas", () => {
  it("insufficient token balance is reported as a simulation result, and dependent figures are not calculated", () => {
    const r = assessTransfer(input({ amountRaw: sui("1500") }));
    expect(r.verdict).toBe("insufficient_balance");
    expect(r.verdictTitle).toBe("Insufficient balance for this simulation");
    expect(r.save.status).toBe("not_computed");
    expect(r.save.balanceAfter).toBeNull();
  });

  it("a USDC transfer still needs SUI for gas", () => {
    const r = assessTransfer(input({ asset: USDC_ASSET, amountRaw: usdc("10"), balances: new Map([[SUI, sui("0.0005")], [USDC, usdc("500")]]) }));
    expect(r.verdict).toBe("insufficient_gas");
    expect(r.verdictTitle).toBe("Insufficient estimated SUI gas for this simulation");
    const gas = r.findings.find((f) => f.title.startsWith("Insufficient estimated SUI gas"))!;
    expect(gas.detail).toMatch(/needed even though the asset is USDC/);
    expect(gas.detail).toMatch(/median past fee \(20 transactions\), not a quote/);
  });

  it("a USDC transfer with enough SUI passes the gas check", () => {
    const r = assessTransfer(input({ asset: USDC_ASSET, amountRaw: usdc("10"), balances: new Map([[SUI, sui("5")], [USDC, usdc("500")]]) }));
    expect(r.verdict).not.toBe("insufficient_gas");
    expect(titles(r)).toContain("Estimated gas covered");
    expect(r.save.suiAfterEstimated).toBe("4.999");
  });

  it("sending all SUI leaves nothing for gas", () => {
    const r = assessTransfer(input({ amountRaw: sui("1000") }));
    expect(r.verdict).toBe("insufficient_gas");
  });

  it("unknown gas is an unknown, not a pass", () => {
    const r = assessTransfer(input({ gas: { estimateMist: null, samples: 0, basis: "historical_median" } }));
    expect(r.findings.find((f) => f.title === "Gas cost unknown")).toMatchObject({ category: "unknown" });
    expect(r.verdict).toBe("proceed_with_caution");
  });
});

describe("conservative Max (estimated available)", () => {
  const gas = { estimateMist: "1000000", samples: 20, basis: "historical_median" as const };
  it("deducts earmarks, the configured gas reserve and a 2× gas buffer from SUI", () => {
    const s = computeSpendable({ ...SUI_ASSET, balance: sui("100"), earmarked: sui("30"), isSui: true, gas, settings: settings({ gasReserveSui: "10" }), price: price("2") });
    expect(s).toMatchObject({ totalBalance: "100", earmarked: "30", gasBuffer: "0.002", gasReserve: "10", estimatedAvailable: "59.998" });
    expect(s.notes.join(" ")).toMatch(/an estimate, not a quote/);
  });

  it("converts the stablecoin reserve with the reference price, or explains why it could not", () => {
    const withPrice = computeSpendable({ ...USDC_ASSET, balance: usdc("300"), earmarked: usdc("100"), isSui: false, gas, settings: settings({ minStablecoinReserveUsd: "50" }), price: price("1") });
    expect(withPrice).toMatchObject({ stablecoinReserve: "50", estimatedAvailable: "150", gasBuffer: "0" });
    const noPrice = computeSpendable({ ...USDC_ASSET, balance: usdc("300"), earmarked: 0n, isSui: false, gas, settings: settings({ minStablecoinReserveUsd: "50" }), price: null });
    expect(noPrice.estimatedAvailable).toBe("300");
    expect(noPrice.notes.join(" ")).toMatch(/could not be converted to units without a reference price/);
  });

  it("is never negative", () => {
    expect(computeSpendable({ ...SUI_ASSET, balance: sui("1"), earmarked: sui("5"), isSui: true, gas, settings: null, price: null }).estimatedAvailable).toBe("0");
  });

  it("an amount above the estimate (but within the balance) is a caution", () => {
    const r = assessTransfer(input({ goals: [goal({ id: "r", kind: "reserve", targetDate: null, coinType: SUI, symbol: "SUI", decimals: 9, targetAmount: "990", earmark: "990" })], amountRaw: sui("15") }));
    expect(titles(r)).toContain("Above the estimated available amount");
  });
});

describe("Protect: pre-execution adapter", () => {
  it("scores unusual amounts and new recipients from onchain history", () => {
    const big = assessTransfer(input({ amountRaw: sui("100") }));
    expect(big.protect.signals.map((s) => s.rule)).toEqual(["UNUSUAL_AMOUNT"]);
    const fresh = assessTransfer(input({ recipient: STRANGER }));
    expect(fresh.protect.signals.map((s) => s.rule)).toEqual(["NEW_RECIPIENT"]);
    expect(fresh.protect.notApplicable[0]).toMatch(/Move package/);
  });

  it("keeps user feedback separate from onchain evidence", () => {
    const flagged = assessTransfer(input({ recipient: STRANGER, memory: { status: "applied", detail: "ok", feedback: [review("suspicious")], pastChecks: [], decisions: [], notes: [] } }));
    expect(flagged.protect.signals.map((s) => s.rule)).toEqual(["NEW_RECIPIENT"]); // no USER_FLAGGED_RECIPIENT in evidence
    const warning = flagged.findings.find((f) => f.pillar === "memory" && f.level === "warning")!;
    expect(warning).toMatchObject({ category: "preference", title: "You previously marked this recipient as suspicious" });
    expect(warning.detail).toMatch(/your own earlier assessment, not confirmed evidence of fraud/);
    expect(flagged.verdict).toBe("review_carefully");

    const trusted = assessTransfer(input({ recipient: STRANGER, memory: { status: "applied", detail: "ok", feedback: [review("expected")], pastChecks: [], decisions: [], notes: [] } }));
    expect(trusted.protect.signals.map((s) => s.rule)).toEqual(["NEW_RECIPIENT"]); // evidence unchanged by trust
    expect(trusted.findings.find((f) => f.pillar === "memory")?.detail).toMatch(/Onchain signals above are shown unchanged/);
  });

  it("preserves critical onchain findings regardless of feedback", () => {
    const r = assessTransfer(input({ amountRaw: sui("95"), balances: new Map([[SUI, sui("100")]]), recipient: STRANGER, memory: { status: "applied", detail: "ok", feedback: [review("expected")], pastChecks: [], decisions: [], notes: [] } }));
    expect(r.protect.signals.find((s) => s.rule === "LARGE_OUTFLOW")?.critical).toBe(true);
    expect(r.protect.severity).toBe("high");
    expect(r.verdict).toBe("review_carefully");
  });

  it("surfaces open critical findings already on the wallet", () => {
    const r = assessTransfer(input({ walletCriticals: [{ digest: "FIXTURE-drain-123", title: "Most of the balance moved out" }] }));
    expect(r.findings.find((f) => f.title === "Open critical finding on this wallet")?.detail).toMatch(/FIXTURE-dr/);
  });

  it("reports thin history as unknowns instead of guessing", () => {
    const r = assessTransfer(input({ history: regularHistory().slice(0, 2), recipient: STRANGER, amountRaw: sui("500") }));
    expect(r.protect.confidence).toBe("insufficient");
    expect(r.findings.filter((f) => f.pillar === "protect" && f.category === "unknown").length).toBeGreaterThan(0);
  });

  it("recipient history facts", () => {
    const r = assessTransfer(input());
    expect(r.protect.recipient).toMatchObject({ timesPaidByWallet: 7, hasSentToWallet: false });
  });
});

describe("recipient lookup", () => {
  it("an unavailable lookup does not stop the assessment", () => {
    const r = assessTransfer(input({ recipientLookup: { status: "unavailable", reason: "Tatum rate limit reached" } }));
    expect(r.findings.find((f) => f.title === "Recipient lookup unavailable")).toMatchObject({ category: "unknown" });
    expect(r.save.status).toBe("computed");
    expect(r.verdict).toBe("proceed_with_caution");
  });

  it("no activity is an unknown, never evidence of safety", () => {
    const r = assessTransfer(input({ recipientLookup: { status: "no_activity" } }));
    expect(r.findings.find((f) => f.title === "No recipient activity found")?.detail).toMatch(/does not mean it is safe or unsafe/);
  });
});

describe("Save impact", () => {
  it("flags use of earmarked funds and a reserve falling below its minimum", () => {
    const reserve = goal({ id: "r", kind: "reserve", name: "Gas reserve", targetDate: null, coinType: SUI, symbol: "SUI", decimals: 9, targetAmount: "60", earmark: "60" });
    const r = assessTransfer(input({ goals: [reserve], amountRaw: sui("50"), balances: new Map([[SUI, sui("100")]]) }));
    expect(r.save.earmarkedUsed).toBe("10");
    expect(r.save.goals[0]).toMatchObject({ name: "Gas reserve", reserveBreached: true, fundedBefore: "60" });
    expect(titles(r)).toContain("Uses funds earmarked for savings");
    expect(r.verdict).toBe("review_carefully");
  });
});

describe("Invest impact", () => {
  const holdings = new Map([[SUI, sui("100")], [USDC, usdc("200")]]);
  it("shows before/after allocation and a new band breach as a preference conflict", () => {
    const r = assessTransfer(input({ balances: holdings, amountRaw: sui("60"), settings: settings({ targets: { native: "50", stablecoin: "50", other: "0" } }) }));
    expect(r.invest).toMatchObject({ status: "computed", transferValueUsd: "120", before: { native: "50.00", stablecoin: "50.00" } });
    expect(r.invest.after?.native).toBe("28.57");
    expect(r.findings.find((f) => f.pillar === "invest" && f.category === "preference")?.title).toMatch(/SUI allocation would leave your band/);
  });

  it("missing prices make allocation impact unavailable rather than misleading", () => {
    const r = assessTransfer(input({ balances: holdings, prices: new Map([[SUI, price("2")]]), settings: settings() }));
    expect(r.invest.status).toBe("unavailable");
    expect(r.invest.before).toBeNull();
  });

  it("transfer value is unknown without a reference price", () => {
    const r = assessTransfer(input({ prices: new Map() }));
    expect(r.invest.transferValueUsd).toBeNull();
    expect(titles(r)).toContain("Transfer value unknown");
  });
});

describe("Memory recall", () => {
  it("recalls a past decision about the same recipient", () => {
    const r = assessTransfer(input({ memory: { status: "applied", detail: "ok", feedback: [], pastChecks: [{ recipient: KNOWN[0], coinType: SUI, amount: "10", decision: "would_not_proceed", note: "Waiting for invoice", createdAt: "2026-10-20T10:00:00.000Z" }], decisions: [], notes: [] } }));
    expect(r.findings.find((f) => f.title === "You checked this recipient before")?.detail).toMatch(/would not proceed with a similar transfer: "Waiting for invoice"/);
    expect(r.memory.items[0].kind).toBe("transfer_check");
  });

  it("states when memory was not consulted", () => {
    const r = assessTransfer(input({ memory: { status: "not_configured", detail: "MEMORY_PROVIDER is not set.", feedback: [], pastChecks: [], decisions: [], notes: [] } }));
    expect(r.findings.find((f) => f.title === "Memory not consulted")?.detail).toBe("MEMORY_PROVIDER is not set.");
  });
});

describe("address checks", () => {
  it("warns on self-transfers and reserved system addresses", () => {
    expect(titles(assessTransfer(input({ recipient: WALLET })))).toContain("Recipient is the same address");
    expect(titles(assessTransfer(input({ recipient: `0x${"0".repeat(63)}2` })))).toContain("Recipient is a reserved system address");
  });
});

describe("wording", () => {
  it("never claims a transfer or recipient is safe, or that a transaction will succeed", () => {
    const scenarios = [input(), input({ recipient: STRANGER }), input({ amountRaw: sui("95"), balances: new Map([[SUI, sui("100")]]) }), input({ recipientLookup: { status: "no_activity" } }), input({ amountRaw: sui("5000") })];
    const allowed = [/does not mean (it|the transfer or recipient) is safe( or unsafe)?/g, /not evidence that an address is safe/g, /cannot guarantee/gi];
    for (const s of scenarios) {
      const r = assessTransfer(s);
      let text = [r.verdictTitle, r.verdictSummary, ...r.findings.flatMap((f) => [f.title, f.detail])].join(" ");
      for (const a of allowed) text = text.replace(a, "");
      expect(text).not.toMatch(/\bsafe\b/i);
      expect(text).not.toMatch(/guarantee|will succeed|blocked/i);
    }
  });
});

describe("simulation only", () => {
  it("assessment code never signs, builds or sends transactions", () => {
    const dir = path.join(process.cwd(), "src/modules/assessment");
    const src = readdirSync(dir).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
    expect(src).not.toMatch(/signAndExecute|executeTransaction|ExecuteTransaction|SimulateTransaction|dryRun|signTransaction|Transaction\(\)|keypair/i);
  });
});
