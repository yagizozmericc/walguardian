import type { SuiNetwork } from "@/lib/env";
import type { PriceProvider, PriceResult, ReferencePrice } from "./pricing.types";

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

/** Prices the user supplied as assumptions. Labelled `user_reference`, never `market`. */
export class ReferencePriceProvider implements PriceProvider {
  readonly id = "user-reference";

  constructor(private readonly references: ReferencePrice[]) {}

  async getPrices(_network: SuiNetwork, coinTypes: string[]): Promise<PriceResult[]> {
    return coinTypes.map((coinType) => {
      const ref = this.references.find((r) => r.coinType === coinType);
      return ref
        ? {
            status: "available",
            coinType,
            price: ref.priceUsd,
            currency: "USD",
            basis: "user_reference",
            source: "Reference price entered by the user (assumption)",
            asOf: ref.setOn,
          }
        : { status: "unavailable", coinType, reason: "No reference price has been set." };
    });
  }
}

export function getPriceProvider(): PriceProvider {
  return new NoPriceProvider();
}

/**
 * Resolves prices in order: market provider first, then the user's reference
 * prices. Each result keeps its basis so the UI can label assumptions.
 */
export async function resolvePrices(
  network: SuiNetwork,
  coinTypes: string[],
  references: ReferencePrice[],
  market: PriceProvider = getPriceProvider(),
): Promise<PriceResult[]> {
  const [fromMarket, fromReference] = await Promise.all([
    market.getPrices(network, coinTypes),
    new ReferencePriceProvider(references).getPrices(network, coinTypes),
  ]);
  return coinTypes.map((_, i) => (fromMarket[i].status === "available" ? fromMarket[i] : fromReference[i]));
}
