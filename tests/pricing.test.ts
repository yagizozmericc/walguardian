import { describe, expect, it } from "vitest";
import { NoPriceProvider } from "@/modules/pricing/pricing.service";

describe("NoPriceProvider", () => {
  it("never invents a price", async () => {
    const r = await new NoPriceProvider().getPrices("testnet", ["0x2::sui::SUI"]);
    expect(r).toEqual([{ status: "unavailable", coinType: "0x2::sui::SUI", reason: "Testnet assets have no market price." }]);
  });
});
