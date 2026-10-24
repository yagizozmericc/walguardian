import type { RebalanceScenario, StrategySettings } from "./strategy.types";

/** Settings before the user configures anything: no targets, no prices, no constraints. */
export function defaultStrategySettings(): StrategySettings {
  return {
    targets: null,
    driftBandPct: "5",
    referencePrices: [],
    excluded: [],
    minStablecoinReserveUsd: null,
    gasReserveSui: null,
    riskTolerance: null,
    horizon: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

const CLASS_NAME = { native: "SUI", stablecoin: "stablecoins", other: "other assets" } as const;

/**
 * A stable description of a scenario's direction, e.g. "reduce SUI; increase stablecoins".
 * Used to match a new scenario with decisions the user made about the same kind of change.
 */
export function describeScenario(s: RebalanceScenario): string {
  const parts = (side: "sell" | "buy") =>
    [...new Set(s.trades.filter((t) => t.side === side).map((t) => CLASS_NAME[t.assetClass]))].sort().join(", ");
  const sell = parts("sell");
  const buy = parts("buy");
  return [sell && `reduce ${sell}`, buy && `increase ${buy}`].filter(Boolean).join("; ") || "no change";
}
