import { formatAmount } from "@/lib/format";
import { formatUnits, parseUnits } from "@/lib/units";
import {
  ASSET_CLASSES,
  type AllocationClass,
  type AllocationStatus,
  type ClassAllocation,
  type RebalanceScenario,
  type ScenarioTrade,
  type StrategySettings,
  type StrategyWarning,
  type ValuedHolding,
} from "./strategy.types";

/**
 * Deterministic allocation mathematics. USD values are integers scaled by
 * 1e8 and truncated; percentages are basis points distributed with the
 * largest-remainder method so they always sum to exactly 100%. No figure here
 * is a market price: every price is a user reference assumption.
 */

export const USD_DECIMALS = 8;
const BPS = 10_000n;

export interface EngineHolding {
  coinType: string;
  symbol: string | null;
  decimals: number | null;
  assetClass: AllocationClass;
  rawBalance: bigint;
}

export interface EnginePrice {
  /** Price per whole coin in USD, scaled by 1e8. */
  priceE8: bigint;
  value: string;
  basis: "market" | "user_reference";
  asOf: string;
}

export interface BuyAsset {
  coinType: string;
  symbol: string;
  decimals: number;
}

export interface EngineInput {
  holdings: EngineHolding[];
  prices: Map<string, EnginePrice>;
  settings: StrategySettings;
  /** Raw amounts earmarked for savings goals, per coin type. Never sold. */
  earmarkedRaw: Map<string, bigint>;
  /** Default asset to buy for a class the wallet does not hold (e.g. USDC for stablecoins). */
  defaultBuyAssets: Partial<Record<AllocationClass, BuyAsset>>;
  suiCoinType: string;
}

export interface EngineOutput {
  status: AllocationStatus;
  unavailableReason: string | null;
  holdings: ValuedHolding[];
  totalUsd: string | null;
  classes: ClassAllocation[] | null;
  scenario: RebalanceScenario | null;
  warnings: StrategyWarning[];
}

export function valueE8(raw: bigint, decimals: number, priceE8: bigint): bigint {
  return (raw * priceE8) / 10n ** BigInt(decimals);
}

export function unitsForValue(valueE8Amount: bigint, decimals: number, priceE8: bigint): bigint {
  return (valueE8Amount * 10n ** BigInt(decimals)) / priceE8;
}

export const pctToBps = (pct: string): bigint => parseUnits(pct, 2);

export function bpsToPct(bps: bigint): string {
  const neg = bps < 0n;
  const abs = neg ? -bps : bps;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

const usd = (e8: bigint) => formatUnits(e8, USD_DECIMALS);
const usdText = (e8: bigint) => `$${formatAmount(usd(e8), 2)}`;

/** Splits 10,000 bps across values in proportion, so the parts always sum to exactly 10,000. */
export function largestRemainder(values: bigint[]): bigint[] {
  const total = values.reduce((s, v) => s + v, 0n);
  if (total === 0n) return values.map(() => 0n);
  const floors = values.map((v) => (v * BPS) / total);
  const remainders = values.map((v, i) => ({ i, r: (v * BPS) % total }));
  let left = BPS - floors.reduce((s, v) => s + v, 0n);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (left === 0n) break;
    floors[i] += 1n;
    left -= 1n;
  }
  return floors;
}

function label(h: { symbol: string | null; coinType: string }): string {
  return h.symbol ?? h.coinType.replace(/<.*>$/, "").split("::").slice(1).join("::");
}

/** "A, B, C, D and 3 more" — keeps messages readable for wallets with many tokens. */
export function listLabels(items: { symbol: string | null; coinType: string }[], max = 4): string {
  const names = items.map(label);
  return names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

export function evaluateAllocation(input: EngineInput): EngineOutput {
  const { settings, prices } = input;
  const excluded = new Set(settings.excluded);
  const held = input.holdings.filter((h) => h.rawBalance > 0n);
  const warnings: StrategyWarning[] = [];

  // Liquidity checks that need no prices.
  const gasReserveRaw = settings.gasReserveSui ? parseUnits(settings.gasReserveSui, 9) : 0n;
  const sui = held.find((h) => h.coinType === input.suiCoinType);
  if (gasReserveRaw > 0n && (sui?.rawBalance ?? 0n) < gasReserveRaw) {
    warnings.push({
      id: "BELOW_GAS_RESERVE",
      level: "warning",
      title: "SUI below gas reserve",
      detail: `The wallet holds ${formatAmount(formatUnits(sui?.rawBalance ?? 0n, 9))} SUI, below the ${formatAmount(settings.gasReserveSui!)} SUI you want kept for gas.`,
    });
  }
  for (const [coinType, raw] of input.earmarkedRaw) {
    const h = input.holdings.find((x) => x.coinType === coinType);
    if (raw > (h?.rawBalance ?? 0n) && h?.decimals != null) {
      warnings.push({
        id: "EARMARKS_EXCEED_BALANCE",
        level: "warning",
        title: `Savings earmarks exceed ${label(h)} balance`,
        detail: `${formatAmount(formatUnits(raw, h.decimals))} ${label(h)} is earmarked for savings goals, more than the ${formatAmount(formatUnits(h.rawBalance, h.decimals))} held.`,
      });
    }
  }
  const excludedHeld = held.filter((h) => excluded.has(h.coinType));
  if (excludedHeld.length) {
    warnings.push({
      id: "EXCLUDED_ASSETS",
      level: "info",
      title: "Assets excluded by you",
      detail: `${listLabels(excludedHeld)} ${excludedHeld.length === 1 ? "is" : "are"} left out of the allocation at your request.`,
    });
  }

  const valued: (ValuedHolding & { _value: bigint | null })[] = held.map((h) => {
    const p = prices.get(h.coinType);
    const amount = h.decimals === null ? null : formatUnits(h.rawBalance, h.decimals);
    const base = { coinType: h.coinType, symbol: h.symbol, assetClass: h.assetClass, amount, sharePct: null };
    if (excluded.has(h.coinType)) return { ...base, valueUsd: null, price: null, state: "excluded" as const, _value: null };
    if (h.decimals === null) return { ...base, valueUsd: null, price: null, state: "missing_decimals" as const, _value: null };
    if (!p) return { ...base, valueUsd: null, price: null, state: "missing_price" as const, _value: null };
    const v = valueE8(h.rawBalance, h.decimals, p.priceE8);
    return { ...base, valueUsd: usd(v), price: { value: p.value, basis: p.basis, asOf: p.asOf }, state: "priced" as const, _value: v };
  });
  const strip = (list: typeof valued): ValuedHolding[] =>
    list.map((h) => {
      const rest: ValuedHolding & { _value?: bigint | null } = { ...h };
      delete rest._value;
      return rest;
    });

  const analysed = valued.filter((h) => h.state !== "excluded");
  if (analysed.length === 0) {
    return { status: "empty", unavailableReason: "No assets to analyse: the wallet holds nothing outside your exclusions.", holdings: strip(valued), totalUsd: null, classes: null, scenario: null, warnings };
  }
  const missing = analysed.filter((h) => h.state !== "priced");
  if (missing.length) {
    return {
      status: "incomplete",
      unavailableReason: `Allocation percentages are not shown because ${missing.length === 1 ? listLabels(missing) : `${missing.length} assets (${listLabels(missing)})`} ${missing.length === 1 ? "has" : "have"} no ${missing.some((m) => m.state === "missing_decimals") ? "usable price or published decimals" : "reference price"}. Set a reference price or exclude ${missing.length === 1 ? "it" : "them"}.`,
      holdings: strip(valued),
      totalUsd: null,
      classes: null,
      scenario: null,
      warnings,
    };
  }

  const total = analysed.reduce((s, h) => s + (h._value as bigint), 0n);
  if (total === 0n) {
    return { status: "empty", unavailableReason: "Holdings are worth $0 at your reference prices.", holdings: strip(valued), totalUsd: usd(0n), classes: null, scenario: null, warnings };
  }

  const shares = largestRemainder(analysed.map((h) => h._value as bigint));
  analysed.forEach((h, i) => (h.sharePct = bpsToPct(shares[i])));

  const classValues = ASSET_CLASSES.map((c) => analysed.filter((h) => h.assetClass === c).reduce((s, h) => s + (h._value as bigint), 0n));
  const classBps = largestRemainder(classValues);
  const band = pctToBps(settings.driftBandPct);
  const targets = settings.targets;
  const targetsBps = targets ? ASSET_CLASSES.map((c) => pctToBps(targets[c])) : null;
  const classes: ClassAllocation[] = ASSET_CLASSES.map((c, i) => {
    const drift = targetsBps ? classBps[i] - targetsBps[i] : null;
    return {
      assetClass: c,
      valueUsd: usd(classValues[i]),
      currentPct: bpsToPct(classBps[i]),
      targetPct: targetsBps ? bpsToPct(targetsBps[i]) : null,
      driftPct: drift === null ? null : bpsToPct(drift),
      outOfBand: drift !== null && (drift < 0n ? -drift : drift) > band,
    };
  });
  const bandWarnings: StrategyWarning[] = [];
  for (const c of classes.filter((x) => x.outOfBand)) {
    bandWarnings.push({
      id: "OUT_OF_BAND",
      level: "warning",
      title: `${CLASS_NAME[c.assetClass]} allocation outside your band`,
      detail: `${CLASS_NAME[c.assetClass]} is ${c.currentPct}% against a ${c.targetPct}% target (${c.driftPct!.startsWith("-") ? "" : "+"}${c.driftPct} points; band ±${settings.driftBandPct}).`,
    });
  }
  warnings.unshift(...bandWarnings);
  const minStable = settings.minStablecoinReserveUsd ? parseUnits(settings.minStablecoinReserveUsd, USD_DECIMALS) : 0n;
  const stableIdx = ASSET_CLASSES.indexOf("stablecoin");
  if (minStable > 0n && classValues[stableIdx] < minStable) {
    warnings.push({
      id: "BELOW_STABLE_RESERVE",
      level: "warning",
      title: "Stablecoins below your minimum reserve",
      detail: `Verified stablecoins are worth ${usdText(classValues[stableIdx])} at your reference prices, below your ${usdText(minStable)} minimum.`,
    });
  }

  const scenario = targetsBps
    ? rebalance(input, analysed.map((h) => ({ ...h, value: h._value as bigint })), classValues, targetsBps, total, gasReserveRaw, minStable)
    : null;

  return { status: "complete", unavailableReason: null, holdings: strip(valued), totalUsd: usd(total), classes, scenario, warnings };
}

export const CLASS_NAME: Record<AllocationClass, string> = { native: "SUI", stablecoin: "Stablecoins", other: "Other assets" };

function rebalance(
  input: EngineInput,
  holdings: (ValuedHolding & { value: bigint })[],
  classValues: bigint[],
  targetsBps: bigint[],
  total: bigint,
  gasReserveRaw: bigint,
  minStable: bigint,
): RebalanceScenario {
  const constraints: string[] = [];
  const deltas = ASSET_CLASSES.map((_, i) => (total * targetsBps[i]) / BPS - classValues[i]);
  const engineHolding = (coinType: string) => input.holdings.find((h) => h.coinType === coinType)!;

  // Sells: from the largest holding in each over-weight class first, never touching locked funds.
  const sells: ScenarioTrade[] = [];
  const sellValueByClass = ASSET_CLASSES.map(() => 0n);
  ASSET_CLASSES.forEach((c, ci) => {
    let need = deltas[ci] < 0n ? -deltas[ci] : 0n;
    if (need === 0n) return;
    if (c === "stablecoin" && minStable > 0n) {
      const capacity = classValues[ci] > minStable ? classValues[ci] - minStable : 0n;
      if (capacity < need) {
        constraints.push(`Stablecoin sales are limited to keep your ${usdText(minStable)} minimum reserve.`);
        need = capacity;
      }
    }
    const inClass = holdings.filter((h) => h.assetClass === c).sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
    for (const h of inClass) {
      if (need === 0n) break;
      const eh = engineHolding(h.coinType);
      const price = input.prices.get(h.coinType)!;
      let locked = input.earmarkedRaw.get(h.coinType) ?? 0n;
      if (h.coinType === input.suiCoinType) locked += gasReserveRaw;
      const sellableRaw = eh.rawBalance > locked ? eh.rawBalance - locked : 0n;
      const sellable = valueE8(sellableRaw, eh.decimals!, price.priceE8);
      if (locked > 0n && sellable < need) {
        constraints.push(
          `${label(h)} sales are limited: ${formatAmount(formatUnits(locked > eh.rawBalance ? eh.rawBalance : locked, eh.decimals!))} ${label(h)} is held back for ${h.coinType === input.suiCoinType && gasReserveRaw > 0n ? "gas and savings earmarks" : "savings earmarks"}.`,
        );
      }
      const take = sellable < need ? sellable : need;
      if (take === 0n) continue;
      sells.push({ side: "sell", assetClass: c, coinType: h.coinType, symbol: h.symbol, amount: formatUnits(unitsForValue(take, eh.decimals!, price.priceE8), eh.decimals!), valueUsd: usd(take) });
      sellValueByClass[ci] += take;
      need -= take;
    }
  });

  const proceeds = sellValueByClass.reduce((s, v) => s + v, 0n);
  const deficits = deltas.map((d) => (d > 0n ? d : 0n));
  const totalDeficit = deficits.reduce((s, v) => s + v, 0n);
  const limited = proceeds < totalDeficit;
  const buyValues = deficits.map((d) => (limited && totalDeficit > 0n ? (d * proceeds) / totalDeficit : d));
  // Rounding dust: sell exactly what is bought.
  let dust = proceeds - buyValues.reduce((s, v) => s + v, 0n);
  for (let i = sells.length - 1; i >= 0 && dust > 0n; i--) {
    const t = sells[i];
    const v = parseUnits(t.valueUsd, USD_DECIMALS);
    const cut = v < dust ? v : dust;
    const eh = engineHolding(t.coinType!);
    const price = input.prices.get(t.coinType!)!;
    const next = v - cut;
    t.valueUsd = usd(next);
    t.amount = formatUnits(unitsForValue(next, eh.decimals!, price.priceE8), eh.decimals!);
    sellValueByClass[ASSET_CLASSES.indexOf(t.assetClass)] -= cut;
    dust -= cut;
  }

  const buys: ScenarioTrade[] = [];
  ASSET_CLASSES.forEach((c, ci) => {
    const v = buyValues[ci];
    if (v === 0n) return;
    const inClass = holdings.filter((h) => h.assetClass === c).sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
    const target = inClass[0]
      ? { coinType: inClass[0].coinType, symbol: inClass[0].symbol, decimals: engineHolding(inClass[0].coinType).decimals! }
      : input.defaultBuyAssets[c] ?? null;
    const price = target ? input.prices.get(target.coinType) : undefined;
    if (target && !price) constraints.push(`Set a reference price for ${target.symbol ?? "the asset"} to size the ${CLASS_NAME[c].toLowerCase()} purchase in units.`);
    if (!target) constraints.push(`No ${CLASS_NAME[c].toLowerCase()} asset is held or registered, so the purchase is shown as a value only.`);
    buys.push({
      side: "buy",
      assetClass: c,
      coinType: target?.coinType ?? null,
      symbol: target?.symbol ?? null,
      amount: target && price ? formatUnits(unitsForValue(v, target.decimals, price.priceE8), target.decimals) : null,
      valueUsd: usd(v),
    });
  });

  const after = ASSET_CLASSES.map((_, i) => classValues[i] - sellValueByClass[i] + buyValues[i]);
  const afterBps = largestRemainder(after);
  const resultingPct = Object.fromEntries(ASSET_CLASSES.map((c, i) => [c, bpsToPct(afterBps[i])])) as Record<AllocationClass, string>;
  if (limited) constraints.unshift("Constraints prevent reaching the target allocation fully; purchases are scaled down to the available proceeds.");

  return {
    trades: [...sells.filter((t) => t.valueUsd !== usd(0n)), ...buys],
    resultingPct,
    reachesTargets: !limited,
    constraintsApplied: [...new Set(constraints)],
    assumptions: [
      "Illustrative only. Guardian does not execute trades, and nothing here is a recommendation to buy or sell.",
      "Values use your reference prices, which are assumptions, not market prices.",
      "Ignores trading fees, slippage, gas costs, taxes and price movement.",
      "Sales draw from the largest holding in a class first; purchases go to the largest existing holding in a class, or the registered default asset.",
      "Funds earmarked for savings goals and your SUI gas reserve are never sold.",
      "USD values are truncated to 8 decimal places.",
    ],
  };
}
