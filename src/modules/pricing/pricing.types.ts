import type { SuiNetwork } from "@/lib/env";

/**
 * Provider-independent valuation contracts. A quote always names its source,
 * basis and timestamp; an asset without a usable price yields an explicit
 * "unavailable" result, never an estimate.
 */

export interface PriceQuote {
  status: "available";
  coinType: string;
  /** Exact decimal string in the quote currency. */
  price: string;
  currency: "USD";
  /**
   * "market": from a market data provider (none configured on Testnet).
   * "user_reference": a price the user entered as an assumption; never a market price.
   */
  basis: "market" | "user_reference";
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

export interface ReferencePrice {
  coinType: string;
  priceUsd: string;
  /** ISO date the user set it. */
  setOn: string;
}
