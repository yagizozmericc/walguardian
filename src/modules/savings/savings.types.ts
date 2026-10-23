import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

/**
 * Savings goal contracts. Shared by client and server. Amounts are exact
 * decimal strings in the goal's asset; conversion to integer units happens in
 * the engine using the asset's verified decimals.
 */

const DecimalAmount = z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a positive decimal amount.");
const SignedDecimalAmount = z.string().trim().regex(/^-?\d+(\.\d+)?$/, "Enter a decimal amount.");
const IsoDate = z.string().refine(isIsoDate, "Use a valid YYYY-MM-DD date.");

export const AllocationEventSchema = z.object({
  id: z.string().min(1).max(64),
  date: IsoDate,
  /** Change in funds earmarked for this goal; negative releases funds. */
  delta: SignedDecimalAmount,
  note: z.string().max(200).optional(),
});

export const SavingsGoalSchema = z
  .object({
    id: z.string().min(1).max(64),
    /** "target": reach an amount by a date. "reserve": keep at least an amount set aside. */
    kind: z.enum(["target", "reserve"]),
    name: z.string().trim().min(1, "Name the goal.").max(80),
    coinType: z.string().min(5).max(300),
    symbol: z.string().max(32).nullable(),
    decimals: z.number().int().min(0).max(18),
    targetAmount: DecimalAmount,
    targetDate: IsoDate.nullable(),
    monthlyContribution: DecimalAmount.nullable(),
    notes: z.string().max(500).nullable(),
    startDate: IsoDate,
    allocations: z.array(AllocationEventSchema).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((g, ctx) => {
    if (g.kind === "target" && !g.targetDate) {
      ctx.addIssue({ code: "custom", path: ["targetDate"], message: "A target goal needs a target date." });
    }
    if (g.targetDate && g.targetDate <= g.startDate) {
      ctx.addIssue({ code: "custom", path: ["targetDate"], message: "The target date must be after the start date." });
    }
    if (g.allocations.some((a) => a.date < g.startDate)) {
      ctx.addIssue({ code: "custom", path: ["allocations"], message: "Allocations cannot predate the goal." });
    }
  });

export type AllocationEvent = z.infer<typeof AllocationEventSchema>;
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;

export type ScheduleStatus = "completed" | "ahead" | "on_track" | "behind" | "overdue" | "not_applicable";
export type FundingStatus = "verified" | "partially_backed" | "unchecked";

export interface SavingsInsight {
  id:
    | "COMPLETED"
    | "BEHIND_SCHEDULE"
    | "PLAN_SHORTFALL"
    | "NO_PLAN"
    | "OVERDUE"
    | "FUNDING_SHORTFALL"
    | "RESERVE_BELOW_TARGET";
  level: "info" | "warning";
  title: string;
  detail: string;
}

export interface GoalEvaluation {
  goalId: string;
  kind: SavingsGoal["kind"];
  coinType: string;
  symbol: string | null;
  asOf: string;
  target: string;
  /** Sum of allocation events, as recorded by the user. */
  earmarked: string;
  /** Portion of the earmark backed by the wallet's current onchain balance; null if not checked. */
  verified: string | null;
  fundingStatus: FundingStatus;
  /** Amount used for progress: verified when checked, otherwise earmarked. */
  funded: string;
  remaining: string;
  /** Floor to one decimal place, 0–100. */
  progressPct: string;
  completed: boolean;
  daysRemaining: number | null;
  /** Monthly amount needed from today to reach the target by the target date (rounded up). */
  requiredMonthly: string | null;
  plannedMonthly: string | null;
  /** How much the plan falls short each month (required − planned), if it does. */
  monthlyShortfall: string | null;
  schedule: { status: ScheduleStatus; expectedByNow: string | null };
  projection: { estimatedCompletionDate: string | null; meetsTargetDate: boolean | null };
  history: { date: string; earmarked: string }[];
  assumptions: string[];
  insights: SavingsInsight[];
}

export interface AssetCoverage {
  coinType: string;
  symbol: string | null;
  earmarked: string;
  /** Wallet balance from Tatum; null if not checked. */
  walletBalance: string | null;
  unallocated: string | null;
  overCommitted: boolean;
}

export interface SavingsEvaluation {
  address: string;
  asOf: string;
  goals: GoalEvaluation[];
  coverage: AssetCoverage[];
  source: { provider: "tatum"; network: string; fetchedAt: string };
}

export const EvaluateRequestSchema = z.object({
  address: z.string(),
  goals: z.array(SavingsGoalSchema).max(20),
});
