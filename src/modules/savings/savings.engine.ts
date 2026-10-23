import { addDays, daysBetween } from "@/lib/dates";
import { formatAmount } from "@/lib/format";
import { ceilDiv, formatUnits, parseUnits } from "@/lib/units";
import type { AssetCoverage, GoalEvaluation, SavingsGoal, SavingsInsight, ScheduleStatus } from "./savings.types";

/**
 * Deterministic savings calculations. All amounts are integer smallest units
 * (bigint); months are converted from days with exact rational arithmetic.
 * The evaluation date is always passed in, never read from the clock.
 */

/** A month is 365.2425 / 12 days. Expressed as the ratio MONTH_NUM / MONTH_DEN days. */
const MONTH_NUM = 3_652_425n;
const MONTH_DEN = 120_000n;
/** Schedule tolerance: within 1% of the target counts as on track. */
const TOLERANCE_BPS = 100n;

export function earmarkedRaw(goal: SavingsGoal): bigint {
  return goal.allocations.reduce((sum, a) => sum + parseUnits(a.delta, goal.decimals), 0n);
}

/** Validation beyond the schema that needs the asset's decimals. Returns human-readable problems. */
export function validateGoalAmounts(goal: SavingsGoal): string[] {
  const problems: string[] = [];
  const parse = (label: string, v: string | null) => {
    if (v === null) return null;
    try {
      return parseUnits(v, goal.decimals);
    } catch (err) {
      problems.push(`${label}: ${(err as Error).message}`);
      return null;
    }
  };
  const target = parse("Target amount", goal.targetAmount);
  if (target !== null && target <= 0n) problems.push("Target amount must be greater than zero.");
  parse("Monthly contribution", goal.monthlyContribution);
  let running = 0n;
  for (const a of [...goal.allocations].sort((x, y) => x.date.localeCompare(y.date))) {
    const d = parse(`Allocation on ${a.date}`, a.delta);
    if (d === null) continue;
    running += d;
    if (running < 0n) {
      problems.push(`Allocations on ${a.date} release more than was earmarked.`);
      break;
    }
  }
  return problems;
}

/** Months from `days`, as needed for "amount per month": amount × MONTH_NUM / (days × MONTH_DEN), rounded up. */
export function perMonthOver(amount: bigint, days: number): bigint {
  if (days <= 0) throw new RangeError("days must be positive");
  return ceilDiv(amount * MONTH_NUM, BigInt(days) * MONTH_DEN);
}

/** Days needed to accumulate `amount` at `perMonth`, rounded up. */
export function daysToAccumulate(amount: bigint, perMonth: bigint): number {
  if (perMonth <= 0n) throw new RangeError("perMonth must be positive");
  return Number(ceilDiv(amount * MONTH_NUM, perMonth * MONTH_DEN));
}

/**
 * Splits each asset's wallet balance across goal earmarks. Reserve goals are
 * backed first (they protect liquidity), then target goals oldest first.
 * Returns the verified (backed) amount per goal.
 */
export function allocateCoverage(
  goals: SavingsGoal[],
  balances: Map<string, bigint> | null,
): { verified: Map<string, bigint | null>; coverage: AssetCoverage[] } {
  const verified = new Map<string, bigint | null>();
  const byAsset = new Map<string, SavingsGoal[]>();
  for (const g of goals) byAsset.set(g.coinType, [...(byAsset.get(g.coinType) ?? []), g]);

  const coverage: AssetCoverage[] = [];
  for (const [coinType, list] of byAsset) {
    const ordered = [...list].sort(
      (a, b) =>
        (a.kind === "reserve" ? 0 : 1) - (b.kind === "reserve" ? 0 : 1) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    const decimals = ordered[0].decimals;
    const total = ordered.reduce((s, g) => s + earmarkedRaw(g), 0n);
    const balance = balances ? (balances.get(coinType) ?? 0n) : null;
    let available = balance;
    for (const g of ordered) {
      if (available === null) {
        verified.set(g.id, null);
        continue;
      }
      const want = earmarkedRaw(g);
      const backed = want < available ? want : available;
      verified.set(g.id, backed);
      available -= backed;
    }
    coverage.push({
      coinType,
      symbol: ordered[0].symbol,
      earmarked: formatUnits(total, decimals),
      walletBalance: balance === null ? null : formatUnits(balance, decimals),
      unallocated: balance === null ? null : formatUnits(balance > total ? balance - total : 0n, decimals),
      overCommitted: balance !== null && total > balance,
    });
  }
  return { verified, coverage };
}

function fmt(raw: bigint, goal: SavingsGoal): string {
  return `${formatAmount(formatUnits(raw, goal.decimals), Math.min(goal.decimals, 6))} ${goal.symbol ?? "units"}`;
}

export function evaluateGoal(goal: SavingsGoal, asOf: string, verifiedRaw: bigint | null): GoalEvaluation {
  const target = parseUnits(goal.targetAmount, goal.decimals);
  const earmarked = earmarkedRaw(goal);
  const funded = verifiedRaw ?? earmarked;
  const remaining = funded >= target ? 0n : target - funded;
  const completed = funded >= target;
  const progressPermille = target === 0n ? 0n : (funded * 1000n) / target;
  const progressPct = (Number(progressPermille > 1000n ? 1000n : progressPermille) / 10).toFixed(1);
  const planned = goal.monthlyContribution === null ? null : parseUnits(goal.monthlyContribution, goal.decimals);
  const daysRemaining = goal.targetDate ? daysBetween(asOf, goal.targetDate) : null;

  let requiredMonthly: bigint | null = null;
  if (completed) requiredMonthly = 0n;
  else if (daysRemaining !== null && daysRemaining > 0) requiredMonthly = perMonthOver(remaining, daysRemaining);
  else if (daysRemaining === 0) requiredMonthly = remaining;

  const monthlyShortfall =
    requiredMonthly !== null && planned !== null && requiredMonthly > planned ? requiredMonthly - planned : null;

  // Straight-line plan from 0 on the start date to the target on the target date.
  let status: ScheduleStatus = "not_applicable";
  let expectedByNow: bigint | null = null;
  if (goal.kind === "target" && goal.targetDate) {
    const total = daysBetween(goal.startDate, goal.targetDate);
    const elapsed = Math.min(Math.max(daysBetween(goal.startDate, asOf), 0), total);
    expectedByNow = (target * BigInt(elapsed)) / BigInt(total);
    const tolerance = (target * TOLERANCE_BPS) / 10_000n;
    if (completed) status = "completed";
    else if (daysRemaining !== null && daysRemaining < 0) status = "overdue";
    else if (funded + tolerance < expectedByNow) status = "behind";
    else if (funded > expectedByNow + tolerance) status = "ahead";
    else status = "on_track";
  } else if (completed) {
    status = "completed";
  }

  let estimatedCompletionDate: string | null = null;
  let meetsTargetDate: boolean | null = null;
  if (completed) {
    meetsTargetDate = true;
  } else if (planned !== null && planned > 0n) {
    estimatedCompletionDate = addDays(asOf, daysToAccumulate(remaining, planned));
    meetsTargetDate = goal.targetDate ? estimatedCompletionDate <= goal.targetDate : null;
  }

  const fundingStatus = verifiedRaw === null ? "unchecked" : verifiedRaw < earmarked ? "partially_backed" : "verified";

  const assumptions = [
    "Only funds you earmark for this goal count toward it; the wallet balance is not counted automatically.",
    fundingStatus === "unchecked"
      ? "Earmarks have not been checked against a wallet balance."
      : "Earmarks are checked against the current wallet balance from Tatum. If the wallet holds less than all earmarks for an asset, reserve goals are backed first, then target goals oldest first.",
    `Amounts are in ${goal.symbol ?? "the goal's asset"}; no fiat valuation or price change is assumed.`,
    "A month is 365.2425 ÷ 12 ≈ 30.44 days; monthly requirements are rounded up to the asset's smallest unit.",
  ];
  if (goal.kind === "target" && goal.targetDate) {
    assumptions.push(`Schedule compares against a straight-line plan from 0 on ${goal.startDate} to the target on ${goal.targetDate}, within a 1% tolerance.`);
  }
  if (estimatedCompletionDate) {
    assumptions.push("The completion estimate assumes the planned monthly amount is earmarked every month from today, with no withdrawals and no yield.");
  }

  const insights: SavingsInsight[] = [];
  const reserveMet = goal.kind === "reserve" && completed;
  if (completed && goal.kind === "target") {
    insights.push({ id: "COMPLETED", level: "info", title: "Target reached", detail: `${fmt(funded, goal)} is set aside against a target of ${fmt(target, goal)}.` });
  }
  if (goal.kind === "reserve" && !reserveMet) {
    insights.push({
      id: "RESERVE_BELOW_TARGET",
      level: "warning",
      title: "Reserve below its minimum",
      detail: `${fmt(funded, goal)} is set aside; ${fmt(remaining, goal)} more is needed to reach the ${fmt(target, goal)} minimum.`,
    });
  }
  if (fundingStatus === "partially_backed" && verifiedRaw !== null) {
    insights.push({
      id: "FUNDING_SHORTFALL",
      level: "warning",
      title: "Wallet holds less than earmarked",
      detail: `${fmt(earmarked, goal)} is earmarked, but only ${fmt(verifiedRaw, goal)} is backed by the current wallet balance after other goals in this asset. Progress uses the backed amount.`,
    });
  }
  if (status === "overdue") {
    insights.push({
      id: "OVERDUE",
      level: "warning",
      title: "Target date has passed",
      detail: `The goal was due ${goal.targetDate}; ${fmt(remaining, goal)} remains. Consider setting a new date.`,
    });
  }
  if (status === "behind" && expectedByNow !== null && requiredMonthly !== null) {
    insights.push({
      id: "BEHIND_SCHEDULE",
      level: "warning",
      title: "Behind schedule",
      detail: `${fmt(funded, goal)} is set aside versus ${fmt(expectedByNow, goal)} expected by today. Earmarking ${fmt(requiredMonthly, goal)} per month would reach the target by ${goal.targetDate}.`,
    });
  }
  if (monthlyShortfall !== null && requiredMonthly !== null && planned !== null) {
    insights.push({
      id: "PLAN_SHORTFALL",
      level: "warning",
      title: "Planned contribution is too low",
      detail: `The plan of ${fmt(planned, goal)} per month falls ${fmt(monthlyShortfall, goal)} short of the ${fmt(requiredMonthly, goal)} needed each month.`,
    });
  }
  if (!completed && (planned === null || planned === 0n) && goal.kind === "target") {
    insights.push({
      id: "NO_PLAN",
      level: "info",
      title: "No monthly contribution planned",
      detail: requiredMonthly !== null ? `Reaching the target on time needs about ${fmt(requiredMonthly, goal)} per month.` : "Set a monthly contribution to get a completion estimate.",
    });
  }

  const byDate = new Map<string, bigint>();
  for (const a of [...goal.allocations].sort((x, y) => x.date.localeCompare(y.date))) {
    byDate.set(a.date, (byDate.get(a.date) ?? 0n) + parseUnits(a.delta, goal.decimals));
  }
  let running = 0n;
  const history = [...byDate.entries()].map(([date, delta]) => {
    running += delta;
    return { date, earmarked: formatUnits(running, goal.decimals) };
  });

  const s = (v: bigint | null) => (v === null ? null : formatUnits(v, goal.decimals));
  return {
    goalId: goal.id,
    kind: goal.kind,
    coinType: goal.coinType,
    symbol: goal.symbol,
    asOf,
    target: formatUnits(target, goal.decimals),
    earmarked: formatUnits(earmarked, goal.decimals),
    verified: s(verifiedRaw),
    fundingStatus,
    funded: formatUnits(funded, goal.decimals),
    remaining: formatUnits(remaining, goal.decimals),
    progressPct,
    completed,
    daysRemaining,
    requiredMonthly: s(requiredMonthly),
    plannedMonthly: s(planned),
    monthlyShortfall: s(monthlyShortfall),
    schedule: { status, expectedByNow: s(expectedByNow) },
    projection: { estimatedCompletionDate, meetsTargetDate },
    history,
    assumptions,
    insights,
  };
}

export function evaluateGoals(
  goals: SavingsGoal[],
  asOf: string,
  balances: Map<string, bigint> | null,
): { goals: GoalEvaluation[]; coverage: AssetCoverage[] } {
  const { verified, coverage } = allocateCoverage(goals, balances);
  return { goals: goals.map((g) => evaluateGoal(g, asOf, verified.get(g.id) ?? null)), coverage };
}
