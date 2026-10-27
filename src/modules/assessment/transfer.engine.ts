import { formatAmount, formatTimestamp } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { ceilDiv, formatUnits, parseUnits } from "@/lib/units";
import type { ActivityItem } from "@/modules/portfolio/portfolio.types";
import { evaluateGoals } from "@/modules/savings/savings.engine";
import type { SavingsGoal } from "@/modules/savings/savings.types";
import { assessCandidate } from "@/modules/security/risk.engine";
import type { FeedbackKnowledge, RuleId } from "@/modules/security/security.types";
import { USD_DECIMALS, evaluateAllocation, valueE8, type BuyAsset, type EngineHolding, type EnginePrice } from "@/modules/strategy/allocation.engine";
import type { AllocationClass, StrategySettings } from "@/modules/strategy/strategy.types";
import type {
  Finding,
  GasEstimate,
  GoalImpact,
  InvestView,
  MemoryView,
  ProtectView,
  RecipientLookup,
  SaveView,
  SpendableBreakdown,
  Verdict,
} from "./transfer.types";

/**
 * Deterministic pre-transaction assessment. Pure: every input is passed in,
 * including the current time. SIMULATION ONLY — nothing here builds, signs or
 * sends a transaction, and no result claims that a transfer is safe.
 */

export const DISCLAIMER =
  "Simulation only: nothing was signed or sent. Guardian cannot guarantee that a real transaction would succeed or that a recipient is safe.";

/** Rules that can be evaluated before execution for a plain transfer. */
export const PRE_EXECUTION_RULES: ReadonlySet<RuleId> = new Set(["UNUSUAL_AMOUNT", "NEW_RECIPIENT", "FREQUENCY_SPIKE", "LARGE_OUTFLOW", "NEW_ASSET"]);

export const NOT_APPLICABLE_BEFORE_EXECUTION = [
  "First-time Move package use: a simulated plain transfer calls no package, and the commands of a real transaction are unknown until it is built.",
];

/** Title of the historical-estimate gas finding; a successful node simulation supersedes it. */
export const INSUFFICIENT_GAS_TITLE = "Insufficient estimated SUI gas for this simulation";

/** Gas buffer kept by the conservative "Max" amount, as a multiple of the median estimate. */
export const GAS_BUFFER_MULTIPLIER = 2n;

const RESERVED_ADDRESSES = new Set(["0", "1", "2", "3", "5", "6", "7", "8", "403", "c"].map((h) => `0x${h.padStart(64, "0")}`));

// ---------------------------------------------------------------- gas & spendable

export function estimateGas(history: ActivityItem[]): GasEstimate {
  const fees = history
    .filter((a) => a.isSender && a.success !== false && a.gasFeeMist !== null)
    .map((a) => BigInt(a.gasFeeMist as string))
    .filter((f) => f > 0n)
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (fees.length === 0) return { estimateMist: null, samples: 0, basis: "historical_median" };
  const mid = Math.floor(fees.length / 2);
  const median = fees.length % 2 ? fees[mid] : (fees[mid - 1] + fees[mid]) / 2n;
  return { estimateMist: median.toString(), samples: fees.length, basis: "historical_median" };
}

export interface SpendableInput {
  coinType: string;
  symbol: string | null;
  decimals: number;
  assetClass: AllocationClass;
  balance: bigint;
  earmarked: bigint;
  isSui: boolean;
  gas: GasEstimate;
  settings: StrategySettings | null;
  price: EnginePrice | null;
  /**
   * USD value (1e-8) of the user's OTHER verified stablecoins at reference prices,
   * which also count toward the stablecoin reserve; null when any of them has no price.
   */
  otherStablecoinsValueE8: bigint | null;
}

/** Value of verified stablecoins other than `excludeCoinType`; null if any held one lacks a price. */
export function otherStablecoinsValue(holdings: EngineHolding[], prices: Map<string, EnginePrice>, excludeCoinType: string): bigint | null {
  let total = 0n;
  for (const h of holdings) {
    if (h.assetClass !== "stablecoin" || h.coinType === excludeCoinType || h.rawBalance === 0n) continue;
    const p = prices.get(h.coinType);
    if (!p || h.decimals === null) return null;
    total += valueE8(h.rawBalance, h.decimals, p.priceE8);
  }
  return total;
}

export function computeSpendable(i: SpendableInput): SpendableBreakdown {
  const notes: string[] = [];
  const gasEstimate = i.gas.estimateMist === null ? null : BigInt(i.gas.estimateMist);
  let gasBuffer = 0n;
  let gasReserve = 0n;
  if (i.isSui) {
    if (gasEstimate === null) notes.push("No gas estimate is available from this wallet's history; keep some SUI for gas.");
    else {
      gasBuffer = gasEstimate * GAS_BUFFER_MULTIPLIER;
      notes.push(`Keeps ${formatAmount(formatUnits(gasBuffer, 9))} SUI for gas (twice the wallet's median past fee; an estimate, not a quote).`);
    }
    if (i.settings?.gasReserveSui) {
      gasReserve = parseUnits(i.settings.gasReserveSui, 9);
      notes.push(`Keeps your configured gas reserve of ${formatAmount(i.settings.gasReserveSui)} SUI.`);
    }
  }
  let stableReserve: bigint | null = null;
  if (i.assetClass === "stablecoin" && i.settings?.minStablecoinReserveUsd) {
    // The reserve applies to all verified stablecoins together: deduct only the part not covered by the others.
    const minE8 = parseUnits(i.settings.minStablecoinReserveUsd, USD_DECIMALS);
    if (!i.price) {
      notes.push("Your minimum stablecoin reserve could not be converted to units without a reference price for this coin, so it was not deducted.");
    } else {
      const others = i.otherStablecoinsValueE8;
      const remainingE8 = others === null ? minE8 : minE8 > others ? minE8 - others : 0n;
      stableReserve = remainingE8 === 0n ? 0n : ceilDiv(remainingE8 * 10n ** BigInt(i.decimals), i.price.priceE8);
      if (others === null) {
        notes.push(`Keeps your full $${i.settings.minStablecoinReserveUsd} minimum stablecoin reserve in this coin, because another stablecoin you hold has no reference price (conservative).`);
      } else if (others > 0n) {
        notes.push(`Keeps the part of your $${i.settings.minStablecoinReserveUsd} minimum stablecoin reserve not already covered by your other stablecoins ($${formatAmount(formatUnits(others, USD_DECIMALS), 2)} at reference prices).`);
      } else {
        notes.push(`Keeps your minimum stablecoin reserve ($${i.settings.minStablecoinReserveUsd} at your reference price).`);
      }
    }
  }
  if (i.earmarked > 0n) notes.push(`Excludes ${formatAmount(formatUnits(i.earmarked, i.decimals))} ${i.symbol ?? ""} earmarked for savings goals.`.replace(/ +\./, "."));
  const available = i.balance - i.earmarked - gasBuffer - gasReserve - (stableReserve ?? 0n);
  const f = (v: bigint, d = i.decimals) => formatUnits(v, d);
  return {
    coinType: i.coinType,
    symbol: i.symbol,
    decimals: i.decimals,
    totalBalance: f(i.balance),
    earmarked: f(i.earmarked),
    gasBuffer: f(gasBuffer, 9),
    gasReserve: f(gasReserve, 9),
    stablecoinReserve: stableReserve === null ? null : f(stableReserve),
    estimatedAvailable: f(available > 0n ? available : 0n),
    notes,
  };
}

// ---------------------------------------------------------------- assessment

export interface AssessmentInput {
  wallet: string;
  recipient: string;
  asset: { coinType: string; symbol: string | null; decimals: number; assetClass: AllocationClass };
  amountRaw: bigint;
  nowMs: number;
  asOf: string;
  suiCoinType: string;
  balances: Map<string, bigint>;
  holdings: EngineHolding[];
  history: ActivityItem[];
  gas: GasEstimate;
  recipientLookup: RecipientLookup;
  lowestAvailableCheckpoint: string | null;
  goals: SavingsGoal[];
  settings: StrategySettings | null;
  prices: Map<string, EnginePrice>;
  defaultBuyAssets: Partial<Record<AllocationClass, BuyAsset>>;
  memory: {
    status: MemoryView["status"];
    detail: string;
    feedback: FeedbackKnowledge[];
    pastChecks: { recipient: string; coinType: string; amount: string; decision: "would_proceed" | "would_not_proceed"; note: string | null; createdAt: string }[];
    decisions: { decision: string; scenario: string; reason: string | null; createdAt: string }[];
    notes: { summary: string; createdAt: string }[];
  };
  /** Open critical findings from this wallet's historical assessment. */
  walletCriticals: { digest: string; title: string }[];
}

export interface AssessmentResult {
  verdict: Verdict;
  verdictTitle: string;
  verdictSummary: string;
  findings: Finding[];
  protect: ProtectView;
  save: SaveView;
  invest: InvestView;
  memory: MemoryView;
  spendable: SpendableBreakdown;
}

const amountText = (raw: bigint, decimals: number, symbol: string | null) => `${formatAmount(formatUnits(raw, decimals), 6)} ${symbol ?? "units"}`;

export function assessTransfer(input: AssessmentInput): AssessmentResult {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "id">) => findings.push({ id: `F${findings.length + 1}`, ...f });
  const { asset, amountRaw, recipient, wallet } = input;
  const isSui = asset.coinType === input.suiCoinType;
  const balance = input.balances.get(asset.coinType) ?? 0n;
  const suiBalance = input.balances.get(input.suiCoinType) ?? 0n;
  const gasEstimate = input.gas.estimateMist === null ? null : BigInt(input.gas.estimateMist);
  const earmarkedByCoin = new Map<string, bigint>();
  for (const g of input.goals) {
    const raw = g.allocations.reduce((s, a) => s + parseUnits(a.delta, g.decimals), 0n);
    earmarkedByCoin.set(g.coinType, (earmarkedByCoin.get(g.coinType) ?? 0n) + raw);
  }
  const earmarked = earmarkedByCoin.get(asset.coinType) ?? 0n;
  const amount = amountText(amountRaw, asset.decimals, asset.symbol);

  // ---- General facts --------------------------------------------------------
  if (recipient === wallet) {
    add({ pillar: "general", category: "fact", level: "warning", title: "Recipient is the same address", detail: "The recipient is the wallet being analysed; a transfer to itself would only spend gas." });
  }
  if (RESERVED_ADDRESSES.has(recipient)) {
    add({ pillar: "general", category: "fact", level: "warning", title: "Recipient is a reserved system address", detail: `${shortAddress(recipient)} is a Sui system or framework address. Funds sent there are generally not recoverable.` });
  }
  const insufficientBalance = amountRaw > balance;
  if (insufficientBalance) {
    add({ pillar: "save", category: "fact", level: "critical", title: "Insufficient balance for this simulation", detail: `The wallet holds ${amountText(balance, asset.decimals, asset.symbol)}, less than the ${amount} entered.` });
  }

  // ---- Gas (SUI is needed for every transfer, whatever the asset) -----------
  const suiAfterTransfer = isSui ? suiBalance - (insufficientBalance ? 0n : amountRaw) : suiBalance;
  let insufficientGas = false;
  if (gasEstimate === null) {
    add({ pillar: "save", category: "unknown", level: "caution", title: "Gas cost unknown", detail: "No past transactions to estimate a gas fee from. Every Sui transfer, including token transfers, needs SUI for gas." });
  } else if (!insufficientBalance) {
    const gasText = `${formatAmount(formatUnits(gasEstimate, 9), 9)} SUI`;
    if (suiAfterTransfer < gasEstimate) {
      insufficientGas = true;
      add({
        pillar: "save",
        category: "fact",
        level: "critical",
        title: INSUFFICIENT_GAS_TITLE,
        detail: `${isSui ? "After the amount entered, the wallet would hold" : "The wallet holds"} ${formatAmount(formatUnits(suiAfterTransfer > 0n ? suiAfterTransfer : 0n, 9), 9)} SUI, below the estimated gas of ${gasText}${isSui ? "" : ` needed even though the asset is ${asset.symbol ?? "a token"}`}. The estimate is the wallet's median past fee (${input.gas.samples} transactions), not a quote.`,
      });
    } else {
      add({ pillar: "save", category: "pattern", level: "info", title: "Estimated gas covered", detail: `Estimated gas ${gasText} (median of ${input.gas.samples} past transactions; an estimate, not a quote) is covered by the SUI balance${isSui ? " after the transfer" : ""}.` });
    }
  }

  // ---- Protect: pre-execution adapter (onchain evidence only) ---------------
  const candidate = {
    timestampMs: input.nowMs,
    outflows: [{ coinType: asset.coinType, symbol: asset.symbol, decimals: asset.decimals, rawAmount: amountRaw }],
    recipients: [recipient],
    packages: [],
  };
  // User feedback is deliberately not passed: it is reported separately and never mixed with onchain evidence.
  const raw = assessCandidate(candidate, input.history, insufficientBalance ? null : input.balances, []);
  const signals = raw.signals.filter((s) => PRE_EXECUTION_RULES.has(s.rule));
  const score = Math.min(100, signals.reduce((s, x) => s + x.points, 0));
  const severity: ProtectView["severity"] = signals.some((s) => s.critical) || score >= 60 ? "high" : score >= 30 ? "medium" : score > 0 ? "low" : "none";
  for (const s of signals) {
    add({ pillar: "protect", category: "pattern", level: s.critical ? "critical" : s.points >= 25 ? "warning" : "caution", title: s.title, detail: s.explanation, evidence: s.evidence });
  }
  for (const l of raw.limitations.filter((x) => PRE_EXECUTION_RULES.has(x.rule))) {
    add({ pillar: "protect", category: "unknown", level: "caution", title: "Not evaluated", detail: l.reason });
  }
  for (const n of raw.notes) add({ pillar: "protect", category: "pattern", level: "info", title: "Evaluated, not scored", detail: n });

  const sent = input.history.filter((a) => a.isSender && a.success !== false && a.recipients.includes(recipient));
  const lastPaid = sent.reduce<number | null>((m, a) => (a.timestampMs !== null && (m === null || a.timestampMs > m) ? a.timestampMs : m), null);
  const hasSentToWallet = input.history.some((a) => !a.isSender && a.counterparties.includes(recipient));
  add({
    pillar: "protect",
    category: "pattern",
    level: "info",
    title: sent.length ? "Recipient paid before" : "Recipient not paid before",
    detail: sent.length
      ? `This wallet sent to ${shortAddress(recipient)} ${sent.length} time(s) in the analysed history, most recently ${formatTimestamp(lastPaid)}.`
      : `No transfer from this wallet to ${shortAddress(recipient)} appears in the analysed history.${hasSentToWallet ? " The recipient has previously sent funds to this wallet." : ""}`,
  });
  const lookup = input.recipientLookup;
  if (lookup.status === "active") {
    add({ pillar: "protect", category: "pattern", level: "info", title: "Recipient has onchain activity", detail: `${lookup.atLeast ? "At least " : ""}${lookup.recentTransactions} recent transaction(s) affect the recipient${lookup.lastActivityMs ? `, latest ${formatTimestamp(lookup.lastActivityMs)}` : ""}. Activity is not evidence that an address is safe.` });
  } else if (lookup.status === "no_activity") {
    add({ pillar: "protect", category: "unknown", level: "caution", title: "No recipient activity found", detail: `No transactions affecting the recipient were found in the node's available history${input.lowestAvailableCheckpoint ? ` (from checkpoint ${input.lowestAvailableCheckpoint})` : ""}. This does not mean it is safe or unsafe.` });
  } else {
    add({ pillar: "protect", category: "unknown", level: "caution", title: "Recipient lookup unavailable", detail: `The recipient's onchain activity could not be checked: ${lookup.reason}` });
  }
  for (const c of input.walletCriticals.slice(0, 3)) {
    add({ pillar: "protect", category: "pattern", level: "warning", title: "Open critical finding on this wallet", detail: `Earlier transaction ${c.digest.slice(0, 10)}… has a critical signal (${c.title}) that remains open.` });
  }

  const protect: ProtectView = {
    score,
    severity,
    confidence: raw.confidence,
    signals,
    notApplicable: NOT_APPLICABLE_BEFORE_EXECUTION,
    recipient: { address: recipient, timesPaidByWallet: sent.length, lastPaidMs: lastPaid, hasSentToWallet, lookup },
  };

  // ---- Save ------------------------------------------------------------------
  const f = (v: bigint, d = asset.decimals) => formatUnits(v, d);
  const unallocatedBefore = balance - earmarked;
  let save: SaveView;
  let balancesAfter: Map<string, bigint> | null = null;
  if (insufficientBalance) {
    save = {
      status: "not_computed",
      reason: "The amount exceeds the balance, so after-transfer figures are not calculated.",
      balanceBefore: f(balance),
      balanceAfter: null,
      suiBefore: f(suiBalance, 9),
      suiAfterEstimated: null,
      unallocatedBefore: f(unallocatedBefore > 0n ? unallocatedBefore : 0n),
      unallocatedAfter: null,
      earmarkedUsed: "0",
      goals: [],
    };
  } else {
    balancesAfter = new Map(input.balances);
    balancesAfter.set(asset.coinType, balance - amountRaw);
    const suiAfterEstimated = suiAfterTransfer - (gasEstimate ?? 0n);
    balancesAfter.set(input.suiCoinType, suiAfterEstimated > 0n ? suiAfterEstimated : 0n);
    const freeBefore = unallocatedBefore > 0n ? unallocatedBefore : 0n;
    const earmarkedUsed = amountRaw > freeBefore ? amountRaw - freeBefore : 0n;
    const before = evaluateGoals(input.goals, input.asOf, input.balances);
    const after = evaluateGoals(input.goals, input.asOf, balancesAfter);
    const goals: GoalImpact[] = [];
    for (const g of input.goals) {
      const b = before.goals.find((x) => x.goalId === g.id)!;
      const a = after.goals.find((x) => x.goalId === g.id)!;
      if (b.funded === a.funded) continue;
      const breached = g.kind === "reserve" && b.completed && !a.completed;
      goals.push({ goalId: g.id, name: g.name, kind: g.kind, fundedBefore: b.funded, fundedAfter: a.funded, progressBefore: b.progressPct, progressAfter: a.progressPct, reserveBreached: breached });
      add({
        pillar: "save",
        category: "fact",
        level: breached ? "warning" : "caution",
        title: breached ? `Reserve "${g.name}" would fall below its minimum` : `Goal "${g.name}" would lose backed funds`,
        detail: `Backed funds would go from ${formatAmount(b.funded, 6)} to ${formatAmount(a.funded, 6)} ${g.symbol ?? ""} (${b.progressPct}% → ${a.progressPct}%).`,
      });
    }
    if (earmarkedUsed > 0n) {
      add({ pillar: "save", category: "fact", level: "warning", title: "Uses funds earmarked for savings", detail: `${amountText(earmarkedUsed, asset.decimals, asset.symbol)} of the amount would come from funds you earmarked for savings goals.` });
    }
    save = {
      status: "computed",
      reason: null,
      balanceBefore: f(balance),
      balanceAfter: f(balance - amountRaw),
      suiBefore: f(suiBalance, 9),
      suiAfterEstimated: f(suiAfterEstimated > 0n ? suiAfterEstimated : 0n, 9),
      unallocatedBefore: f(freeBefore),
      unallocatedAfter: f(balance - amountRaw - earmarked > 0n ? balance - amountRaw - earmarked : 0n),
      earmarkedUsed: f(earmarkedUsed),
      goals,
    };
  }

  // ---- Invest ----------------------------------------------------------------
  const settings = input.settings ?? null;
  const price = input.prices.get(asset.coinType) ?? null;
  const transferValueUsd = price ? formatUnits(valueE8(amountRaw, asset.decimals, price.priceE8), USD_DECIMALS) : null;
  if (!price) add({ pillar: "invest", category: "unknown", level: "caution", title: "Transfer value unknown", detail: `No reference price is set for ${asset.symbol ?? "this asset"}, so the transfer has no USD value here.` });
  let invest: InvestView;
  if (!settings) {
    invest = { status: "unavailable", reason: "No investment preferences saved, so allocation impact is not assessed.", transferValueUsd, before: null, after: null, targets: null };
    add({ pillar: "invest", category: "unknown", level: "info", title: "No investment preferences", detail: invest.reason! });
  } else if (!balancesAfter) {
    invest = { status: "not_computed", reason: "The amount exceeds the balance.", transferValueUsd, before: null, after: null, targets: null };
  } else {
    const earmarkedRaw = earmarkedByCoin;
    const run = (bal: Map<string, bigint>) =>
      evaluateAllocation({
        holdings: input.holdings.map((h) => ({ ...h, rawBalance: bal.get(h.coinType) ?? 0n })),
        prices: input.prices,
        settings,
        earmarkedRaw,
        defaultBuyAssets: input.defaultBuyAssets,
        suiCoinType: input.suiCoinType,
      });
    const b = run(input.balances);
    const a = run(balancesAfter);
    if (b.status !== "complete" || a.status !== "complete") {
      const reason = (b.status !== "complete" ? b.unavailableReason : a.unavailableReason) ?? "Allocation unavailable.";
      invest = { status: "unavailable", reason, transferValueUsd, before: null, after: null, targets: null };
      add({ pillar: "invest", category: "unknown", level: "caution", title: "Allocation impact unavailable", detail: reason });
    } else {
      const pct = (r: typeof a) => Object.fromEntries(r.classes!.map((c) => [c.assetClass, c.currentPct]));
      invest = {
        status: "computed",
        reason: null,
        transferValueUsd,
        before: pct(b),
        after: pct(a),
        targets: settings.targets ? { native: settings.targets.native, stablecoin: settings.targets.stablecoin, other: settings.targets.other } : null,
      };
      for (const c of a.classes!) {
        const wasOut = b.classes!.find((x) => x.assetClass === c.assetClass)?.outOfBand;
        if (c.outOfBand && !wasOut) {
          add({ pillar: "invest", category: "preference", level: "caution", title: `${c.assetClass === "native" ? "SUI" : c.assetClass === "stablecoin" ? "Stablecoin" : "Other-asset"} allocation would leave your band`, detail: `It would move to ${c.currentPct}% against your ${c.targetPct}% target (band ±${settings.driftBandPct}).` });
        }
      }
      for (const w of a.warnings) {
        if ((w.id === "BELOW_STABLE_RESERVE" || w.id === "BELOW_GAS_RESERVE") && !b.warnings.some((x) => x.id === w.id)) {
          add({ pillar: "invest", category: "preference", level: "warning", title: w.title, detail: `${w.detail} (after this simulated transfer)` });
        }
      }
    }
  }

  // ---- Memory (kept separate from onchain evidence) --------------------------
  const memItems: MemoryView["items"] = [];
  for (const fb of input.memory.feedback.filter((x) => x.recipients.includes(recipient))) {
    memItems.push({ kind: "review", summary: `You marked transfer ${fb.digest.slice(0, 10)}… to this recipient as ${fb.verdict}${fb.note ? `: "${fb.note}"` : ""}.`, createdAt: fb.createdAt, source: "your review" });
    if (fb.verdict === "suspicious") {
      add({ pillar: "memory", category: "preference", level: "warning", title: "You previously marked this recipient as suspicious", detail: `On ${fb.createdAt.slice(0, 10)} you marked a transfer to ${shortAddress(recipient)} as suspicious${fb.note ? ` ("${fb.note}")` : ""}. This is your own earlier assessment, not confirmed evidence of fraud.` });
    } else if (fb.verdict === "expected") {
      add({ pillar: "memory", category: "preference", level: "info", title: "You previously marked this recipient as expected", detail: `On ${fb.createdAt.slice(0, 10)} you marked a transfer to ${shortAddress(recipient)} as expected${fb.note ? ` ("${fb.note}")` : ""}. Onchain signals above are shown unchanged.` });
    }
  }
  for (const c of input.memory.pastChecks.filter((x) => x.recipient === recipient)) {
    memItems.push({ kind: "transfer_check", summary: `You checked a transfer of ${formatAmount(c.amount, 6)} to this recipient and said you ${c.decision === "would_proceed" ? "would proceed" : "would not proceed"}${c.note ? `: "${c.note}"` : ""}.`, createdAt: c.createdAt, source: "your decision" });
  }
  const latestCheck = input.memory.pastChecks.filter((x) => x.recipient === recipient).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  if (latestCheck) {
    add({ pillar: "memory", category: "preference", level: latestCheck.decision === "would_not_proceed" ? "caution" : "info", title: "You checked this recipient before", detail: `On ${latestCheck.createdAt.slice(0, 10)} you said you ${latestCheck.decision === "would_proceed" ? "would proceed" : "would not proceed"} with a similar transfer${latestCheck.note ? `: "${latestCheck.note}"` : ""}.` });
  }
  for (const d of input.memory.decisions.slice(0, 2)) memItems.push({ kind: "investment_decision", summary: `You ${d.decision} "${d.scenario}"${d.reason ? `: "${d.reason}"` : ""}.`, createdAt: d.createdAt, source: "your decision" });
  for (const n of input.memory.notes.slice(0, 3)) memItems.push({ kind: "note", summary: n.summary, createdAt: n.createdAt, source: "your note" });
  if (input.memory.status !== "applied") {
    add({ pillar: "memory", category: "unknown", level: "info", title: "Memory not consulted", detail: input.memory.detail });
  }
  const memory: MemoryView = { status: input.memory.status, detail: input.memory.detail, items: memItems };

  // ---- Spendable -----------------------------------------------------------------
  const spendable = computeSpendable({
    coinType: asset.coinType,
    symbol: asset.symbol,
    decimals: asset.decimals,
    assetClass: asset.assetClass,
    balance,
    earmarked,
    isSui,
    gas: input.gas,
    settings,
    price,
    otherStablecoinsValueE8: otherStablecoinsValue(input.holdings, input.prices, asset.coinType),
  });
  if (!insufficientBalance && amountRaw > parseUnits(spendable.estimatedAvailable, asset.decimals)) {
    add({ pillar: "save", category: "preference", level: "caution", title: "Above the estimated available amount", detail: `The amount exceeds the conservative estimate of ${formatAmount(spendable.estimatedAvailable, 6)} ${asset.symbol ?? ""} available after earmarks, reserves and a gas buffer.` });
  }

  // ---- Verdict (fixed precedence; never "safe") --------------------------------
  const flagged = findings.some((x) => x.pillar === "memory" && x.level === "warning");
  const hasUnknown = findings.some((x) => x.category === "unknown" && x.level !== "info");
  let verdict: Verdict;
  if (insufficientBalance) verdict = "insufficient_balance";
  else if (insufficientGas) verdict = "insufficient_gas";
  else if (severity === "high" || flagged || findings.some((x) => x.category === "fact" && x.level === "warning")) verdict = "review_carefully";
  else if (score > 0 || hasUnknown || findings.some((x) => x.level === "caution" || x.level === "warning")) verdict = "proceed_with_caution";
  else verdict = "no_issues_found";

  const counts = (cat: Finding["category"]) => findings.filter((x) => x.category === cat && x.level !== "info").length;
  const TITLES: Record<Verdict, string> = {
    insufficient_balance: "Insufficient balance for this simulation",
    insufficient_gas: INSUFFICIENT_GAS_TITLE,
    review_carefully: "Review carefully before sending",
    proceed_with_caution: "Proceed with caution",
    no_issues_found: "No issues found in the available data",
  };
  const summary = `${counts("fact")} confirmed fact(s), ${counts("pattern")} historical pattern(s), ${counts("preference")} preference or decision conflict(s), ${counts("unknown")} unknown(s).${verdict === "no_issues_found" ? " This does not mean the transfer or recipient is safe." : ""}`;

  return { verdict, verdictTitle: TITLES[verdict], verdictSummary: summary, findings, protect, save, invest, memory, spendable };
}
