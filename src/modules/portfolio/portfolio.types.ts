import type { ChainInfo, DataSource, MoveCallRef } from "@/modules/blockchain/blockchain.types";
import type { AssetClass } from "./assets";

export interface Holding {
  coinType: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  /** Integer balance in the coin's smallest unit. */
  rawBalance: string;
  /** Exact decimal amount; null when decimals are unknown. */
  amount: string | null;
  assetClass: AssetClass;
  /** Why the asset is classified as it is (registry entry), or null for "other". */
  classificationReference: string | null;
}

export type ActivityDirection = "out" | "in" | "swap" | "none";

export interface ActivityTransfer {
  coinType: string;
  symbol: string | null;
  decimals: number | null;
  /**
   * Signed change for the watched address, in smallest units. For native SUI
   * sent by the watched address, the gas fee is excluded so this reflects the
   * transferred value only (see `gasExcluded`).
   */
  rawAmount: string;
  amount: string | null;
  gasExcluded: boolean;
}

export interface ActivityItem {
  digest: string;
  timestampMs: number | null;
  checkpoint: string | null;
  success: boolean | null;
  kind: "programmable" | "system" | "unknown";
  isSender: boolean;
  sender: string | null;
  direction: ActivityDirection;
  transfers: ActivityTransfer[];
  /** Other addresses on the opposite side of the watched address's balance changes. */
  counterparties: string[];
  /** Addresses that received a coin the watched address sent in this transaction. */
  recipients: string[];
  gasFeeMist: string | null;
  moveCalls: MoveCallRef[];
}

export interface Valuation {
  status: "unavailable";
  reason: string;
}

export interface PortfolioSnapshot {
  address: string;
  network: DataSource["network"];
  chain: ChainInfo;
  holdings: Holding[];
  activity: ActivityItem[];
  activityCursor: string | null;
  valuation: Valuation;
  source: DataSource;
  warnings: string[];
}
