import type { SuiNetwork } from "@/lib/env";
import type { PriceProvider, PriceResult } from "./pricing.types";

/**
 * Returns "unavailable" for every asset. Used on Testnet, where assets have
 * no market price. A CoinGecko provider for verified Mainnet assets can be
 * added behind the same interface; it is not implemented yet.
 */
export class NoPriceProvider implements PriceProvider {
  readonly id = "none";

  async getPrices(network: SuiNetwork, coinTypes: string[]): Promise<PriceResult[]> {
    const reason =
      network === "testnet"
        ? "Testnet assets have no market price."
        : "No price provider is configured.";
    return coinTypes.map((coinType) => ({ status: "unavailable", coinType, reason }));
  }
}

export function getPriceProvider(): PriceProvider {
  return new NoPriceProvider();
}
