import { normalizeStructTag } from "@mysten/sui/utils";
import type { SuiNetwork } from "@/lib/env";

export type AssetClass = "native" | "stablecoin" | "other";

interface KnownAsset {
  coinType: string;
  symbol: string;
  /**
   * Coin decimals. Testnet values were confirmed via Tatum GetCoinInfo on
   * 2026-10-24; Mainnet values are from Circle's documentation and unverified
   * here. Server code re-checks decimals against onchain metadata before use.
   */
  decimals: number;
  assetClass: AssetClass;
  /** Where the identification comes from. */
  reference: string;
}

/**
 * Explicit, network-specific asset registry. A token is classified as a
 * stablecoin only when its full coin type appears here; symbols alone are
 * never trusted (anyone can mint a coin with symbol "USDC").
 */
const REGISTRY: Record<SuiNetwork, KnownAsset[]> = {
  testnet: [
    { coinType: "0x2::sui::SUI", symbol: "SUI", decimals: 9, assetClass: "native", reference: "Sui framework native coin" },
    {
      coinType: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
      symbol: "USDC",
      decimals: 6,
      assetClass: "stablecoin",
      reference: "Circle native USDC (Sui Testnet), circle.com/blog/now-available-native-usdc-on-sui",
    },
  ],
  mainnet: [
    { coinType: "0x2::sui::SUI", symbol: "SUI", decimals: 9, assetClass: "native", reference: "Sui framework native coin" },
    {
      coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      symbol: "USDC",
      decimals: 6,
      assetClass: "stablecoin",
      reference: "Circle native USDC (Sui Mainnet), circle.com/blog/now-available-native-usdc-on-sui",
    },
  ],
};

export const SUI_COIN_TYPE = normalizeStructTag("0x2::sui::SUI");

export function normalizeCoinType(coinType: string): string {
  try {
    return normalizeStructTag(coinType);
  } catch {
    return coinType;
  }
}

export function classifyAsset(
  network: SuiNetwork,
  coinType: string,
): { assetClass: AssetClass; reference: string | null } {
  const target = normalizeCoinType(coinType);
  const hit = REGISTRY[network].find((a) => normalizeCoinType(a.coinType) === target);
  return hit ? { assetClass: hit.assetClass, reference: hit.reference } : { assetClass: "other", reference: null };
}

export function knownAssets(network: SuiNetwork): { coinType: string; symbol: string; decimals: number; assetClass: AssetClass }[] {
  return REGISTRY[network].map((a) => ({ coinType: normalizeCoinType(a.coinType), symbol: a.symbol, decimals: a.decimals, assetClass: a.assetClass }));
}
