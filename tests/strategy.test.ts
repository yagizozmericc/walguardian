import { describe, expect, it } from "vitest";
import { parseUnits } from "@/lib/units";
import { bpsToPct, evaluateAllocation, largestRemainder, valueE8 } from "@/modules/strategy/allocation.engine";
import { StrategySettingsSchema } from "@/modules/strategy/strategy.types";
import { HOLDINGS, OTHER, PRICES, SUI, USDC, hold, input, price, settings } from "./fixtures/strategy.fixture";

const pct = (r: ReturnType<typeof evaluateAllocation>) => Object.fromEntries((r.classes ?? []).map((c) => [c.assetClass, c.currentPct]));
const trades = (r: ReturnType<typeof evaluateAllocation>) =>
  r.scenario!.trades.map((t) => `${t.side} ${t.amount ?? "?"} ${t.symbol ?? "?"} $${t.valueUsd}`);

describe("math primitives", () => {
  it("values exactly: raw × price / 10^decimals", () => {
    expect(valueE8(parseUnits("1.5", 9), 9, parseUnits("2.25", 8))).toBe(parseUnits("3.375", 8));
    expect(valueE8(1n, 9, parseUnits("0.5", 8))).toBe(0n); // truncates below 1e-8 USD
  });

  it("largest remainder always sums to 100.00%", () => {
    expect(largestRemainder([1n, 1n, 1n])).toEqual([3334n, 3333n, 3333n]);
    expect(largestRemainder([2n, 1n])).toEqual([6667n, 3333n]);
    expect(largestRemainder([0n, 0n])).toEqual([0n, 0n]);
    const parts = largestRemainder([7n, 13n, 29n, 51n, 3n]);
    expect(parts.reduce((s, v) => s + v, 0n)).toBe(10_000n);
  });

  it("formats signed basis points", () => {
    expect(bpsToPct(-2000n)).toBe("-20.00");
    expect(bpsToPct(5n)).toBe("0.05");
  });
});

describe("portfolio allocation", () => {
  it("computes class and asset shares at reference prices", () => {
    const r = evaluateAllocation(input());
    expect(r.status).toBe("complete");
    expect(r.totalUsd).toBe("1000");
    expect(pct(r)).toEqual({ native: "20.00", stablecoin: "30.00", other: "50.00" });
    expect(r.holdings.map((h) => [h.symbol, h.valueUsd, h.sharePct, h.price?.basis])).toEqual([
      ["SUI", "200", "20.00", "user_reference"],
      ["USDC", "300", "30.00", "user_reference"],
      ["OTHER", "500", "50.00", "user_reference"],
    ]);
  });

  it("detects drift outside the band", () => {
    const r = evaluateAllocation(input());
    expect(r.classes!.map((c) => [c.assetClass, c.driftPct, c.outOfBand])).toEqual([
      ["native", "-20.00", true],
      ["stablecoin", "-10.00", true],
      ["other", "30.00", true],
    ]);
    expect(r.warnings.filter((w) => w.id === "OUT_OF_BAND").map((w) => w.title)).toEqual([
      "SUI allocation outside your band",
      "Stablecoins allocation outside your band",
      "Other assets allocation outside your band",
    ]);
  });

  it("stays quiet inside the band", () => {
    const r = evaluateAllocation(input({ settings: settings({ targets: { native: "22", stablecoin: "28", other: "50" } }) }));
    expect(r.classes!.every((c) => !c.outOfBand)).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});

describe("without targets", () => {
  it("shows current allocation only: no drift, no scenario", () => {
    const r = evaluateAllocation(input({ settings: settings({ targets: null }) }));
    expect(r.status).toBe("complete");
    expect(r.classes!.map((c) => [c.currentPct, c.targetPct, c.driftPct, c.outOfBand])).toEqual([
      ["20.00", null, null, false],
      ["30.00", null, null, false],
      ["50.00", null, null, false],
    ]);
    expect(r.scenario).toBeNull();
  });
});

describe("missing prices", () => {
  it("never shows cross-asset percentages when any analysed asset is unpriced", () => {
    const r = evaluateAllocation(input({ prices: new Map([[SUI, price("2")], [USDC, price("1")]]) }));
    expect(r.status).toBe("incomplete");
    expect(r.classes).toBeNull();
    expect(r.scenario).toBeNull();
    expect(r.totalUsd).toBeNull();
    expect(r.holdings.every((h) => h.sharePct === null)).toBe(true);
    expect(r.holdings.find((h) => h.symbol === "OTHER")?.state).toBe("missing_price");
    expect(r.unavailableReason).toContain("OTHER has no reference price");
  });

  it("assets without published decimals also block percentages", () => {
    const r = evaluateAllocation(input({ holdings: [...HOLDINGS, { coinType: "0xvault::v::V", symbol: null, decimals: null, assetClass: "other", rawBalance: 5n }] }));
    expect(r.status).toBe("incomplete");
    expect(r.holdings.find((h) => h.coinType === "0xvault::v::V")?.state).toBe("missing_decimals");
  });

  it("an explicit exclusion lets the rest be analysed, and is reported", () => {
    const r = evaluateAllocation(input({ prices: new Map([[SUI, price("2")], [USDC, price("1")]]), settings: settings({ excluded: [OTHER] }) }));
    expect(r.status).toBe("complete");
    expect(r.totalUsd).toBe("500");
    expect(pct(r)).toEqual({ native: "40.00", stablecoin: "60.00", other: "0.00" });
    expect(r.holdings.find((h) => h.symbol === "OTHER")).toMatchObject({ state: "excluded", valueUsd: null, sharePct: null });
    expect(r.warnings.find((w) => w.id === "EXCLUDED_ASSETS")?.detail).toContain("OTHER");
  });

  it("summarises long lists of unpriced assets", () => {
    const many = Array.from({ length: 6 }, (_, i) => hold(`0x${(i + 10).toString(16).repeat(32)}::t::T${i}<0x2::sui::SUI>`, "1", 9, "other", null as unknown as string));
    const r = evaluateAllocation(input({ holdings: [...HOLDINGS, ...many] }));
    expect(r.unavailableReason).toContain("6 assets (t::T0, t::T1, t::T2, t::T3 and 2 more) have no reference price");
  });

  it("empty when nothing is left to analyse", () => {
    expect(evaluateAllocation(input({ holdings: [] })).status).toBe("empty");
    expect(evaluateAllocation(input({ settings: settings({ excluded: [SUI, USDC, OTHER] }) })).status).toBe("empty");
  });

  it("a zero-balance asset is ignored rather than requiring a price", () => {
    const r = evaluateAllocation(input({ holdings: [...HOLDINGS, { ...hold(`0x${"aa".repeat(32)}::z::Z`, "0", 9, "other", "Z") }] }));
    expect(r.status).toBe("complete");
  });
});

describe("rebalancing scenarios", () => {
  it("reaches targets with no constraints", () => {
    const r = evaluateAllocation(input());
    expect(trades(r)).toEqual(["sell 30 OTHER $300", "buy 100 SUI $200", "buy 100 USDC $100"]);
    expect(r.scenario!.resultingPct).toEqual({ native: "40.00", stablecoin: "40.00", other: "20.00" });
    expect(r.scenario!.reachesTargets).toBe(true);
    expect(r.scenario!.assumptions.join(" ")).toMatch(/does not execute trades/);
  });

  it("never sells savings earmarks or the gas reserve", () => {
    const r = evaluateAllocation(
      input({
        settings: settings({ targets: { native: "10", stablecoin: "40", other: "50" }, gasReserveSui: "20" }),
        earmarkedRaw: new Map([[SUI, parseUnits("40", 9)]]),
      }),
    );
    // Wants to sell $100 of SUI (50 SUI), but 60 SUI are locked: only 40 SUI ($80) can be sold.
    expect(trades(r)).toEqual(["sell 40 SUI $80", "buy 80 USDC $80"]);
    expect(r.scenario!.reachesTargets).toBe(false);
    expect(r.scenario!.resultingPct).toEqual({ native: "12.00", stablecoin: "38.00", other: "50.00" });
    expect(r.scenario!.constraintsApplied.join(" ")).toMatch(/held back for gas and savings earmarks/);
  });

  it("respects the minimum stablecoin reserve", () => {
    const r = evaluateAllocation(input({ settings: settings({ targets: { native: "40", stablecoin: "10", other: "50" }, minStablecoinReserveUsd: "250" }) }));
    expect(trades(r)).toEqual(["sell 50 USDC $50", "buy 25 SUI $50"]);
    expect(r.scenario!.constraintsApplied[0]).toMatch(/scaled down/);
    expect(r.scenario!.constraintsApplied.join(" ")).toMatch(/\$250 minimum reserve/);
  });

  it("buys the registered default asset for a class the wallet does not hold", () => {
    const noUsdc = [hold(SUI, "100", 9, "native", "SUI"), hold(OTHER, "50", 9, "other", "OTHER")];
    const r = evaluateAllocation(input({ holdings: noUsdc, settings: settings({ targets: { native: "30", stablecoin: "50", other: "20" } }) }));
    // Total $700. Stablecoins target $350, bought as USDC at the $1 reference price.
    expect(trades(r)).toContain("buy 350 USDC $350");
  });

  it("shows value only when the purchase asset has no reference price", () => {
    const noUsdc = [hold(SUI, "100", 9, "native", "SUI"), hold(OTHER, "50", 9, "other", "OTHER")];
    const r = evaluateAllocation(
      input({ holdings: noUsdc, prices: new Map([[SUI, price("2")], [OTHER, price("10")]]), settings: settings({ targets: { native: "30", stablecoin: "50", other: "20" } }) }),
    );
    expect(trades(r)).toContain("buy ? USDC $350");
    expect(r.scenario!.constraintsApplied.join(" ")).toMatch(/Set a reference price for USDC/);
  });

  it("a class with no held or registered asset is a value-only purchase", () => {
    const r = evaluateAllocation(input({ holdings: [hold(SUI, "100", 9, "native", "SUI")], prices: PRICES, settings: settings({ targets: { native: "50", stablecoin: "0", other: "50" } }) }));
    expect(r.scenario!.trades.find((t) => t.side === "buy")).toMatchObject({ assetClass: "other", coinType: null, amount: null, valueUsd: "100" });
  });

  it("trades conserve value", () => {
    const r = evaluateAllocation(input({ settings: settings({ targets: { native: "33.33", stablecoin: "33.33", other: "33.34" } }) }));
    const sum = (side: string) => r.scenario!.trades.filter((t) => t.side === side).reduce((s, t) => s + parseUnits(t.valueUsd, 8), 0n);
    expect(sum("sell")).toBe(sum("buy"));
  });
});

describe("liquidity warnings without prices", () => {
  it("flags SUI below the gas reserve and earmarks above balance even when allocation is incomplete", () => {
    const r = evaluateAllocation(
      input({ prices: new Map(), settings: settings({ gasReserveSui: "150" }), earmarkedRaw: new Map([[USDC, parseUnits("500", 6)]]) }),
    );
    expect(r.status).toBe("incomplete");
    expect(r.warnings.map((w) => w.id).sort()).toEqual(["BELOW_GAS_RESERVE", "EARMARKS_EXCEED_BALANCE"]);
  });

  it("flags stablecoins below the minimum reserve", () => {
    expect(evaluateAllocation(input({ settings: settings({ minStablecoinReserveUsd: "400" }) })).warnings.some((w) => w.id === "BELOW_STABLE_RESERVE")).toBe(true);
  });
});

describe("settings validation", () => {
  it("targets must sum to exactly 100%", () => {
    expect(StrategySettingsSchema.safeParse(settings({ targets: { native: "40", stablecoin: "40", other: "19.99" } })).success).toBe(false);
    expect(StrategySettingsSchema.safeParse(settings({ targets: { native: "33.33", stablecoin: "33.33", other: "33.34" } })).success).toBe(true);
  });
  it("rejects bad reference prices", () => {
    const bad = (priceUsd: string) => StrategySettingsSchema.safeParse(settings({ referencePrices: [{ coinType: SUI, priceUsd, setOn: "2026-10-24" }] })).success;
    expect(bad("0")).toBe(false);
    expect(bad("1.123456789")).toBe(false);
    expect(bad("-1")).toBe(false);
    expect(bad("2.5")).toBe(true);
  });
});

describe("determinism", () => {
  it("same input, same output", () => {
    expect(evaluateAllocation(input())).toEqual(evaluateAllocation(input()));
  });
});
