/** FIXTURE — synthetic holdings, reference prices and settings for allocation tests. Not real data. */
import { parseUnits } from "@/lib/units";
import type { EngineHolding, EngineInput, EnginePrice } from "@/modules/strategy/allocation.engine";
import type { StrategySettings } from "@/modules/strategy/strategy.types";

export const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
export const USDC = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
export const OTHER = `0x${"0f".repeat(32)}::token::OTHER`;

export const hold = (coinType: string, amount: string, decimals: number, assetClass: EngineHolding["assetClass"], symbol: string): EngineHolding => ({
  coinType,
  symbol,
  decimals,
  assetClass,
  rawBalance: parseUnits(amount, decimals),
});

export const HOLDINGS = [hold(SUI, "100", 9, "native", "SUI"), hold(USDC, "300", 6, "stablecoin", "USDC"), hold(OTHER, "50", 9, "other", "OTHER")];

export const price = (value: string): EnginePrice => ({ priceE8: parseUnits(value, 8), value, basis: "user_reference", asOf: "2026-10-24" });
export const PRICES = new Map([[SUI, price("2")], [USDC, price("1")], [OTHER, price("10")]]);

export const settings = (over: Partial<StrategySettings> = {}): StrategySettings => ({
  targets: { native: "40", stablecoin: "40", other: "20" },
  driftBandPct: "5",
  referencePrices: [],
  excluded: [],
  minStablecoinReserveUsd: null,
  gasReserveSui: null,
  riskTolerance: null,
  horizon: null,
  updatedAt: "2026-10-24T00:00:00.000Z",
  ...over,
});

export const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  holdings: HOLDINGS,
  prices: PRICES,
  settings: settings(),
  earmarkedRaw: new Map(),
  defaultBuyAssets: { native: { coinType: SUI, symbol: "SUI", decimals: 9 }, stablecoin: { coinType: USDC, symbol: "USDC", decimals: 6 } },
  suiCoinType: SUI,
  ...over,
});
