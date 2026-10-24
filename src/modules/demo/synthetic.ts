import { addDays } from "@/lib/dates";
import { SUI_COIN_TYPE } from "@/modules/portfolio/assets";
import type { SavingsGoal } from "@/modules/savings/savings.types";
import type { StrategySettings } from "@/modules/strategy/strategy.types";

/**
 * SYNTHETIC DEMO DATA. Deterministic records with fixed ids so seeding is
 * idempotent. Every value is invented for demonstration and labelled as such;
 * reference prices are illustrative assumptions, not market prices.
 */

export const SYNTHETIC_GOAL_IDS = ["demo-emergency-reserve", "demo-validator-fund"] as const;
export const SYNTHETIC_NOTE_ENTITY = "demo:note:liquidity";
export const USDC_TESTNET = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

export function syntheticGoals(today: string, nowIso: string): SavingsGoal[] {
  const start = addDays(today, -90);
  const base = { coinType: SUI_COIN_TYPE, symbol: "SUI", decimals: 9, notes: "Synthetic demo data — not a real user goal.", startDate: start, createdAt: nowIso, updatedAt: nowIso };
  return [
    {
      ...base,
      id: SYNTHETIC_GOAL_IDS[0],
      kind: "reserve",
      name: "Emergency reserve (synthetic)",
      targetAmount: "500",
      targetDate: null,
      monthlyContribution: null,
      allocations: [{ id: "demo-a1", date: start, delta: "500", note: "Synthetic initial earmark" }],
    },
    {
      ...base,
      id: SYNTHETIC_GOAL_IDS[1],
      kind: "target",
      name: "Validator stake fund (synthetic)",
      targetAmount: "5000",
      targetDate: addDays(today, 150),
      monthlyContribution: "400",
      allocations: [
        { id: "demo-b1", date: start, delta: "400", note: "Synthetic" },
        { id: "demo-b2", date: addDays(today, -60), delta: "400", note: "Synthetic" },
        { id: "demo-b3", date: addDays(today, -30), delta: "400", note: "Synthetic" },
      ],
    },
  ];
}

export function syntheticStrategy(today: string, nowIso: string): StrategySettings {
  return {
    targets: { native: "60", stablecoin: "40", other: "0" },
    driftBandPct: "5",
    referencePrices: [
      { coinType: SUI_COIN_TYPE, priceUsd: "1.5", setOn: today },
      { coinType: USDC_TESTNET, priceUsd: "1", setOn: today },
    ],
    excluded: [],
    minStablecoinReserveUsd: "1000",
    gasReserveSui: "5",
    riskTolerance: "balanced",
    horizon: "medium",
    updatedAt: nowIso,
  };
}

export const SYNTHETIC_NOTE = "I keep at least 500 SUI liquid for validator operations.";
