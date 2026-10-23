import { describe, expect, it } from "vitest";
import { NoPriceProvider, ReferencePriceProvider, resolvePrices } from "@/modules/pricing/pricing.service";
import type { PriceProvider } from "@/modules/pricing/pricing.types";

describe("pricing", () => {
  it("NoPriceProvider never invents a price", async () => {
    expect(await new NoPriceProvider().getPrices("testnet", ["0x2::sui::SUI"])).toEqual([
      { status: "unavailable", coinType: "0x2::sui::SUI", reason: "Testnet assets have no market price." },
    ]);
  });

  it("reference prices are labelled as user assumptions", async () => {
    const [r] = await new ReferencePriceProvider([{ coinType: "A", priceUsd: "1.25", setOn: "2026-10-24" }]).getPrices("testnet", ["A"]);
    expect(r).toMatchObject({ status: "available", basis: "user_reference", price: "1.25", asOf: "2026-10-24" });
  });

  it("falls back to references only where the market has no price, keeping each basis", async () => {
    const market: PriceProvider = {
      id: "fake-market",
      getPrices: async (_n, cts) =>
        cts.map((c) =>
          c === "M"
            ? { status: "available", coinType: c, price: "2", currency: "USD", basis: "market", source: "test", asOf: "x" }
            : { status: "unavailable", coinType: c, reason: "none" },
        ),
    };
    const r = await resolvePrices("testnet", ["M", "R", "X"], [{ coinType: "R", priceUsd: "3", setOn: "d" }, { coinType: "M", priceUsd: "9", setOn: "d" }], market);
    expect(r.map((p) => (p.status === "available" ? `${p.basis}:${p.price}` : "none"))).toEqual(["market:2", "user_reference:3", "none"]);
  });
});
