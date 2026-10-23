import type { SuiNetwork } from "@/lib/env";

/** Provenance attached to every onchain observation shown to the user. */
export interface DataSource {
  provider: "tatum";
  transport: "grpc";
  network: SuiNetwork;
  endpoint: string;
  fetchedAt: string;
}

export interface ChainInfo {
  chainId: string;
  chain: string;
  epoch: string;
  checkpointHeight: string;
  /** Oldest checkpoint the node still serves transaction data for (history before it is pruned). */
  lowestAvailableCheckpoint: string | null;
  timestamp: string | null;
}

export interface CoinMetadata {
  coinType: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

export interface RawBalance {
  coinType: string;
  /** Total balance in the coin's smallest unit. */
  balance: string;
}

export interface BalanceChange {
  address: string;
  coinType: string;
  /** Signed integer amount in the coin's smallest unit. */
  amount: string;
}

export interface MoveCallRef {
  package: string;
  module: string;
  function: string;
}

export interface NormalizedTransaction {
  digest: string;
  checkpoint: string | null;
  timestampMs: number | null;
  sender: string | null;
  kind: "programmable" | "system" | "unknown";
  success: boolean | null;
  /** computation + storage − rebate, in MIST. May be negative. Null if unavailable. */
  gasFeeMist: string | null;
  balanceChanges: BalanceChange[];
  moveCalls: MoveCallRef[];
}

export interface TransactionPage {
  transactions: NormalizedTransaction[];
  /** Opaque cursor (base64url) to fetch older transactions; null when history is exhausted. */
  nextCursor: string | null;
  /** Why the provider stopped this page. */
  endReason: string | null;
}

export interface BlockchainProvider {
  getChainInfo(): Promise<ChainInfo>;
  getBalances(address: string): Promise<RawBalance[]>;
  getCoinMetadata(coinType: string): Promise<CoinMetadata>;
  getTransactions(
    address: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<TransactionPage>;
  getTransaction(digest: string): Promise<NormalizedTransaction>;
  source(): DataSource;
}
