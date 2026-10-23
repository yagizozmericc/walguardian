import type { SuiNetwork } from "@/lib/env";

/**
 * Provider-independent valuation contracts. A quote always names its source
 * and timestamp; an asset without a trustworthy price yields an explicit
 * "unavailable" result, never an estimate.
 */

export interface PriceQuote {
  status: "available";
  coinType: string;
  /** Exact decimal string in the quote currency. */
  price: string;
  currency: "USD";
  source: string;
  asOf: string;
}

export interface PriceUnavailable {
  status: "unavailable";
  coinType: string;
  reason: string;
}

export type PriceResult = PriceQuote | PriceUnavailable;

export interface PriceProvider {
  readonly id: string;
  getPrices(network: SuiNetwork, coinTypes: string[]): Promise<PriceResult[]>;
}
