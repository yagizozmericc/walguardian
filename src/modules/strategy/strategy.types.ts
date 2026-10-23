import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import type { AssetClass } from "@/modules/portfolio/assets";

/**
 * Investment strategy contracts. Percentages are decimal strings with at most
 * two decimal places (converted to basis points); USD values are decimal
 * strings computed at user reference prices, which are assumptions.
 */

const Percent = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Use a percentage with at most 2 decimals.")
  .refine((v) => Number(v) <= 100, "At most 100%.");
const PositiveDecimal = z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a positive decimal amount.");

export const ASSET_CLASSES = ["native", "stablecoin", "other"] as const satisfies readonly AssetClass[];

export const ReferencePriceSchema = z.object({
  coinType: z.string().min(5).max(300),
  priceUsd: PositiveDecimal.refine((v) => /^\d+(\.\d{1,8})?$/.test(v), "At most 8 decimal places.").refine((v) => !/^0+(\.0+)?$/.test(v), "Price must be greater than zero."),
  setOn: z.string().refine(isIsoDate, "Use a valid date."),
});

export const StrategySettingsSchema = z
  .object({
    /** Null until the user sets targets; current allocation is still shown. */
    targets: z.object({ native: Percent, stablecoin: Percent, other: Percent }).nullable(),
    /** Allowed deviation from target, in percentage points. */
    driftBandPct: Percent,
    referencePrices: z.array(ReferencePriceSchema).max(100),
    /** Coin types the user chose to leave out of allocation analysis. */
    excluded: z.array(z.string().min(5).max(300)).max(100),
    /** Minimum stablecoin value to keep, in USD at reference prices. */
    minStablecoinReserveUsd: PositiveDecimal.nullable(),
    /** SUI kept for gas; never sold in scenarios. */
    gasReserveSui: PositiveDecimal.nullable(),
    riskTolerance: z.enum(["conservative", "balanced", "growth"]).nullable(),
    horizon: z.enum(["short", "medium", "long"]).nullable(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((s, ctx) => {
    if (!s.targets) return;
    const bps = (v: string) => Math.round(Number(v) * 100);
    const sum = bps(s.targets.native) + bps(s.targets.stablecoin) + bps(s.targets.other);
    if (sum !== 10_000) ctx.addIssue({ code: "custom", path: ["targets"], message: `Targets must add up to 100% (currently ${(sum / 100).toFixed(2)}%).` });
  });

export type StrategySettings = z.infer<typeof StrategySettingsSchema>;

export const EarmarkSchema = z.object({
  coinType: z.string().min(5).max(300),
  /** Decimal amount earmarked for savings goals in this asset (summed by the client). */
  amount: PositiveDecimal,
});

export const StrategyRequestSchema = z.object({
  address: z.string(),
  settings: StrategySettingsSchema,
  earmarks: z.array(EarmarkSchema).max(100),
});

export type AllocationClass = (typeof ASSET_CLASSES)[number];

export interface ValuedHolding {
  coinType: string;
  symbol: string | null;
  assetClass: AllocationClass;
  amount: string | null;
  /** USD value at the reference price; null when unpriced or excluded. */
  valueUsd: string | null;
  /** Share of the analysed total in percent (2 dp); null unless allocation is complete. */
  sharePct: string | null;
  price: { value: string; basis: "market" | "user_reference"; asOf: string } | null;
  state: "priced" | "missing_price" | "missing_decimals" | "excluded";
}

export interface ClassAllocation {
  assetClass: AllocationClass;
  valueUsd: string;
  currentPct: string;
  targetPct: string | null;
  /** current − target, percentage points (signed, 2 dp); null without targets. */
  driftPct: string | null;
  outOfBand: boolean;
}

export interface ScenarioTrade {
  side: "sell" | "buy";
  assetClass: AllocationClass;
  coinType: string | null;
  symbol: string | null;
  /** Asset amount at the reference price; null when the asset is unspecified. */
  amount: string | null;
  valueUsd: string;
}

export interface RebalanceScenario {
  trades: ScenarioTrade[];
  /** Allocation after the illustrative trades. */
  resultingPct: Record<AllocationClass, string>;
  reachesTargets: boolean;
  constraintsApplied: string[];
  assumptions: string[];
}

export interface StrategyWarning {
  id: "OUT_OF_BAND" | "BELOW_STABLE_RESERVE" | "BELOW_GAS_RESERVE" | "EARMARKS_EXCEED_BALANCE" | "EXCLUDED_ASSETS";
  level: "info" | "warning";
  title: string;
  detail: string;
}

export type AllocationStatus = "complete" | "incomplete" | "empty";

export interface StrategyEvaluation {
  address: string;
  status: AllocationStatus;
  /** Why cross-asset figures are unavailable, when status is not "complete". */
  unavailableReason: string | null;
  holdings: ValuedHolding[];
  totalUsd: string | null;
  classes: ClassAllocation[] | null;
  scenario: RebalanceScenario | null;
  warnings: StrategyWarning[];
  pricing: { basis: "user_reference"; note: string };
  source: { provider: "tatum"; network: string; fetchedAt: string };
}
