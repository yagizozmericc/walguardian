import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate } from "@/lib/dates";
import {
  allocateCoverage,
  daysToAccumulate,
  evaluateGoal,
  evaluateGoals,
  perMonthOver,
  validateGoalAmounts,
} from "@/modules/savings/savings.engine";
import { SavingsGoalSchema } from "@/modules/savings/savings.types";
import { SUI, USDC, goal } from "./fixtures/savings.fixture";

const AS_OF = "2026-04-01"; // 90 days after start, 91 days before the target date
const ids = (e: ReturnType<typeof evaluateGoal>) => e.insights.map((i) => i.id).sort();

describe("dates", () => {
  it("validates and does UTC day arithmetic", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(daysBetween("2026-01-01", "2026-04-01")).toBe(90);
    expect(daysBetween("2026-04-01", "2026-07-01")).toBe(91);
    expect(addDays("2026-04-01", 102)).toBe("2026-07-12");
  });
});

describe("month arithmetic", () => {
  it("required per month = amount ÷ (days × 12 / 365.2425), rounded up", () => {
    expect(perMonthOver(1_000_000_000n, 91)).toBe(334_471_154n);
    // Exactly one average month of days is never representable in whole days; 365.2425 days is 12 months.
    expect(perMonthOver(12n, 365)).toBe(2n); // 12 / 11.99... rounded up
  });
  it("days to accumulate at a monthly rate, rounded up", () => {
    expect(daysToAccumulate(1_000_000_000n, 300_000_000n)).toBe(102); // 101.456… days
    expect(daysToAccumulate(100n, 100n)).toBe(31); // one month ≈ 30.44 days → 31 whole days
  });
});

describe("evaluateGoal — target goals", () => {
  it("progress, remaining and required monthly contribution", () => {
    const e = evaluateGoal(goal({ earmark: "1000" }), AS_OF, null);
    expect(e).toMatchObject({
      target: "2000",
      earmarked: "1000",
      funded: "1000",
      remaining: "1000",
      progressPct: "50.0",
      completed: false,
      daysRemaining: 91,
      requiredMonthly: "334.471154",
      fundingStatus: "unchecked",
    });
  });

  it("on track within 1% of the straight-line plan", () => {
    const e = evaluateGoal(goal({ earmark: "1000" }), AS_OF, null);
    expect(e.schedule.expectedByNow).toBe("994.475138"); // 2000 × 90 / 181, floored
    expect(e.schedule.status).toBe("on_track");
  });

  it("behind schedule produces a recommendation with the required amount", () => {
    const e = evaluateGoal(goal({ earmark: "500" }), AS_OF, null);
    expect(e.schedule.status).toBe("behind");
    expect(e.requiredMonthly).toBe("501.706731"); // 1500 USDC over 91 days, rounded up
    const behind = e.insights.find((i) => i.id === "BEHIND_SCHEDULE");
    expect(behind?.detail).toContain("501.706731 USDC per month");
  });

  it("ahead of schedule", () => {
    expect(evaluateGoal(goal({ earmark: "1500" }), AS_OF, null).schedule.status).toBe("ahead");
  });

  it("projection at the planned contribution, and the monthly shortfall", () => {
    const e = evaluateGoal(goal({ earmark: "1000", monthlyContribution: "300" }), AS_OF, null);
    expect(e.plannedMonthly).toBe("300");
    expect(e.projection).toEqual({ estimatedCompletionDate: "2026-07-12", meetsTargetDate: false });
    expect(e.monthlyShortfall).toBe("34.471154");
    expect(ids(e)).toEqual(["PLAN_SHORTFALL"]);
  });

  it("a sufficient plan meets the target date with no shortfall", () => {
    const e = evaluateGoal(goal({ earmark: "1000", monthlyContribution: "400" }), AS_OF, null);
    expect(e.projection.meetsTargetDate).toBe(true);
    expect(e.monthlyShortfall).toBeNull();
    expect(e.assumptions.join(" ")).toMatch(/no withdrawals and no yield/);
  });

  it("completed goals need nothing more", () => {
    const e = evaluateGoal(goal({ earmark: "2500" }), AS_OF, null);
    expect(e).toMatchObject({ completed: true, remaining: "0", progressPct: "100.0", requiredMonthly: "0" });
    expect(e.schedule.status).toBe("completed");
    expect(ids(e)).toEqual(["COMPLETED"]);
  });

  it("overdue goals have no required monthly figure", () => {
    const e = evaluateGoal(goal({ earmark: "100" }), "2026-08-01", null);
    expect(e.schedule.status).toBe("overdue");
    expect(e.daysRemaining).toBe(-31);
    expect(e.requiredMonthly).toBeNull();
    expect(ids(e)).toContain("OVERDUE");
  });

  it("due today requires the full remainder", () => {
    expect(evaluateGoal(goal({ earmark: "1500" }), "2026-07-01", null).requiredMonthly).toBe("500");
  });

  it("no plan yields no estimate and an informational insight", () => {
    const e = evaluateGoal(goal({ earmark: "100" }), AS_OF, null);
    expect(e.projection.estimatedCompletionDate).toBeNull();
    expect(e.insights.find((i) => i.id === "NO_PLAN")?.level).toBe("info");
  });

  it("progress percentage floors rather than rounds up", () => {
    expect(evaluateGoal(goal({ earmark: "1999.99" }), AS_OF, null).progressPct).toBe("99.9");
  });

  it("history accumulates allocation events by date", () => {
    const g = goal({
      allocations: [
        { id: "a", date: "2026-01-01", delta: "300" },
        { id: "b", date: "2026-02-01", delta: "200" },
        { id: "c", date: "2026-02-01", delta: "50" },
        { id: "d", date: "2026-03-01", delta: "-100" },
      ],
    });
    expect(evaluateGoal(g, AS_OF, null).history).toEqual([
      { date: "2026-01-01", earmarked: "300" },
      { date: "2026-02-01", earmarked: "550" },
      { date: "2026-03-01", earmarked: "450" },
    ]);
  });

  it("is exact for 9-decimal assets", () => {
    const e = evaluateGoal(goal({ coinType: SUI, symbol: "SUI", decimals: 9, targetAmount: "0.000000003", earmark: "0.000000001" }), AS_OF, null);
    expect(e.remaining).toBe("0.000000002");
    expect(e.progressPct).toBe("33.3");
  });
});

describe("evaluateGoal — reserve goals", () => {
  it("flags a reserve below its minimum, without a schedule", () => {
    const e = evaluateGoal(goal({ kind: "reserve", targetDate: null, targetAmount: "1000", earmark: "600" }), AS_OF, null);
    expect(e.schedule.status).toBe("not_applicable");
    expect(e.requiredMonthly).toBeNull();
    expect(e.remaining).toBe("400");
    expect(ids(e)).toEqual(["RESERVE_BELOW_TARGET"]);
  });
  it("a funded reserve is completed with no warnings", () => {
    const e = evaluateGoal(goal({ kind: "reserve", targetDate: null, targetAmount: "1000", earmark: "1000" }), AS_OF, null);
    expect(e.completed).toBe(true);
    expect(e.insights).toEqual([]);
  });
});

describe("wallet coverage", () => {
  const reserve = goal({ id: "r", kind: "reserve", targetDate: null, targetAmount: "1000", earmark: "1000", createdAt: "2026-02-01T00:00:00.000Z" });
  const target = goal({ id: "t", earmark: "500" });

  it("backs reserves first, then targets oldest first, and flags over-commitment", () => {
    const { verified, coverage } = allocateCoverage([target, reserve], new Map([[USDC, 1_200_000_000n]]));
    expect(verified.get("r")).toBe(1_000_000_000n);
    expect(verified.get("t")).toBe(200_000_000n);
    expect(coverage).toEqual([
      { coinType: USDC, symbol: "USDC", earmarked: "1500", walletBalance: "1200", unallocated: "0", overCommitted: true },
    ]);
  });

  it("progress uses the backed amount and explains the shortfall", () => {
    const { goals } = evaluateGoals([target, reserve], AS_OF, new Map([[USDC, 1_200_000_000n]]));
    const t = goals.find((g) => g.goalId === "t")!;
    expect(t).toMatchObject({ earmarked: "500", verified: "200", funded: "200", fundingStatus: "partially_backed" });
    expect(t.insights.find((i) => i.id === "FUNDING_SHORTFALL")?.detail).toContain("only 200 USDC is backed");
  });

  it("a wallet with enough funds verifies every earmark and reports the unallocated remainder", () => {
    const { goals, coverage } = evaluateGoals([target], AS_OF, new Map([[USDC, 2_000_000_000n]]));
    expect(goals[0].fundingStatus).toBe("verified");
    expect(coverage[0]).toMatchObject({ unallocated: "1500", overCommitted: false });
  });

  it("a coin the wallet no longer holds backs nothing", () => {
    const { goals } = evaluateGoals([target], AS_OF, new Map());
    expect(goals[0]).toMatchObject({ verified: "0", funded: "0", fundingStatus: "partially_backed" });
  });

  it("without a balance check, funding is reported as unchecked", () => {
    const { goals, coverage } = evaluateGoals([target], AS_OF, null);
    expect(goals[0].fundingStatus).toBe("unchecked");
    expect(coverage[0].walletBalance).toBeNull();
  });
});

describe("validation", () => {
  it("rejects precision beyond the asset's decimals and over-release", () => {
    expect(validateGoalAmounts(goal({ targetAmount: "1.0000001" }))).toHaveLength(1);
    expect(
      validateGoalAmounts(goal({ allocations: [{ id: "a", date: "2026-01-02", delta: "10" }, { id: "b", date: "2026-01-03", delta: "-11" }] })),
    ).toEqual(["Allocations on 2026-01-03 release more than was earmarked."]);
    expect(validateGoalAmounts(goal({ targetAmount: "0" }))).toEqual(["Target amount must be greater than zero."]);
    expect(validateGoalAmounts(goal({ earmark: "10" }))).toEqual([]);
  });

  it("schema requires a date for target goals and orders dates", () => {
    expect(SavingsGoalSchema.safeParse(goal({ targetDate: null })).success).toBe(false);
    expect(SavingsGoalSchema.safeParse(goal({ targetDate: "2025-12-31" })).success).toBe(false);
    expect(SavingsGoalSchema.safeParse(goal({ kind: "reserve", targetDate: null })).success).toBe(true);
    expect(SavingsGoalSchema.safeParse(goal({ allocations: [{ id: "a", date: "2025-06-01", delta: "1" }] })).success).toBe(false);
    expect(SavingsGoalSchema.safeParse(goal({ targetAmount: "-5" })).success).toBe(false);
  });
});

describe("determinism", () => {
  it("same inputs, same evaluation", () => {
    const g = goal({ earmark: "700", monthlyContribution: "250" });
    expect(evaluateGoal(g, AS_OF, 650_000_000n)).toEqual(evaluateGoal(g, AS_OF, 650_000_000n));
  });
});
