import { describe, expect, it } from "vitest";
import { classifyAsset } from "@/modules/portfolio/assets";

describe("classifyAsset", () => {
  it("classifies by full coin type, never by symbol", () => {
    expect(classifyAsset("testnet", "0x2::sui::SUI").assetClass).toBe("native");
    expect(
      classifyAsset("testnet", "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC").assetClass,
    ).toBe("stablecoin");
    // A look-alike "USDC" from another package is not a stablecoin.
    expect(classifyAsset("testnet", `0x${"ee".repeat(32)}::usdc::USDC`).assetClass).toBe("other");
  });

  it("does not apply mainnet identifiers on testnet", () => {
    expect(
      classifyAsset("testnet", "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC").assetClass,
    ).toBe("other");
  });
});
