import "server-only";
import { SUI_DECIMALS } from "@mysten/sui/utils";
import { ConfigError, ProviderError } from "@/lib/errors";
import { env, type SuiNetwork } from "@/lib/env";
import { getKv } from "@/lib/kv";
import { SUI_COIN_TYPE, normalizeCoinType } from "@/modules/portfolio/assets";
import type {
  BlockchainProvider,
  ChainInfo,
  CoinMetadata,
  DataSource,
  NormalizedTransaction,
  RawBalance,
  TransactionPage,
} from "./blockchain.types";
import {
  collectTransactionFrames,
  decodeCursor,
  encodeCursor,
  hasMoreHistory,
  normalizeBalances,
  normalizeCoinInfo,
  normalizeExecutedTransaction,
  normalizeServiceInfo,
} from "./sui.normalize";
import { TatumGrpcClient } from "./tatum.client";
import { SharedRequestBudget } from "./tatum.budget";

const TX_READ_MASK = {
  paths: [
    "digest",
    "transaction.sender",
    "transaction.kind",
    "effects.status",
    "effects.gas_used",
    "checkpoint",
    "timestamp",
    "balance_changes",
  ],
};

const MAX_BALANCE_PAGES = 5;
/** ListTransactions may stop at a scan budget with few items; bound follow-up scans per request. */
const MAX_SCAN_ROUNDS = 4;
export const MAX_TX_PAGE = 100;

/** Coin metadata rarely changes; share it across instances for a day. Cache failures are ignored. */
const METADATA_TTL_S = 86_400;

async function readSharedMetadata(coinType: string): Promise<CoinMetadata | null> {
  const { store, shared } = getKv();
  if (!shared) return null;
  try {
    return await store.get<CoinMetadata>(`meta:v1:${coinType}`);
  } catch {
    return null;
  }
}

async function writeSharedMetadata(coinType: string, meta: CoinMetadata): Promise<void> {
  const { store, shared } = getKv();
  if (!shared) return;
  try {
    await store.set(`meta:v1:${coinType}`, meta, METADATA_TTL_S);
  } catch {
    // A cache miss next time is harmless.
  }
}

/** Sui blockchain provider backed by Tatum's Sui gRPC gateway. */
export class SuiTatumProvider implements BlockchainProvider {
  private readonly metadataCache = new Map<string, CoinMetadata>();
  private verifiedChain: Promise<ChainInfo> | null = null;

  constructor(
    private readonly client: TatumGrpcClient,
    private readonly network: SuiNetwork,
  ) {}

  source(): DataSource {
    return {
      provider: "tatum",
      transport: "grpc",
      network: this.network,
      endpoint: this.client.endpoint,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getChainInfo(): Promise<ChainInfo> {
    return normalizeServiceInfo(await this.client.unary("ledger", "GetServiceInfo", {}));
  }

  /**
   * Confirms (once per process) that the gateway is serving the configured
   * network, so a Testnet deployment can never silently read Mainnet.
   */
  async assertNetwork(): Promise<ChainInfo> {
    this.verifiedChain ??= this.getChainInfo().then((info) => {
      if (info.chain.toLowerCase() !== this.network) {
        throw new ProviderError(
          "tatum",
          "PROVIDER_NETWORK_MISMATCH",
          `Tatum endpoint reports chain "${info.chain}" but SUI_NETWORK is "${this.network}".`,
        );
      }
      return info;
    });
    this.verifiedChain.catch(() => {
      this.verifiedChain = null;
    });
    return this.verifiedChain;
  }

  async getBalances(address: string): Promise<RawBalance[]> {
    const all: RawBalance[] = [];
    let pageToken: Uint8Array | null = null;
    for (let page = 0; page < MAX_BALANCE_PAGES; page++) {
      const raw = await this.client.unary("state", "ListBalances", {
        owner: address,
        page_size: 100,
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const { balances, nextPageToken } = normalizeBalances(raw);
      all.push(...balances);
      if (!nextPageToken) return all;
      pageToken = nextPageToken;
    }
    throw new ProviderError("tatum", "PROVIDER_ERROR", `Address holds more than ${MAX_BALANCE_PAGES * 100} coin types; balances truncated.`);
  }

  async getCoinMetadata(coinType: string): Promise<CoinMetadata> {
    const key = normalizeCoinType(coinType);
    const cached = this.metadataCache.get(key);
    if (cached) return cached;
    const shared = await readSharedMetadata(key);
    if (shared) {
      this.metadataCache.set(key, shared);
      return shared;
    }
    let meta: CoinMetadata;
    try {
      meta = normalizeCoinInfo(key, await this.client.unary("state", "GetCoinInfo", { coin_type: key }));
    } catch (err) {
      // Native SUI decimals are a protocol constant; nothing else is assumed.
      if (key !== SUI_COIN_TYPE || !(err instanceof ProviderError) || err.code !== "PROVIDER_NOT_FOUND") throw err;
      meta = { coinType: key, symbol: "SUI", name: "Sui", decimals: SUI_DECIMALS };
    }
    this.metadataCache.set(key, meta);
    await writeSharedMetadata(key, meta);
    return meta;
  }

  async getTransactions(
    address: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<TransactionPage> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), MAX_TX_PAGE);
    let before: Uint8Array | undefined = opts.cursor ? decodeCursor(opts.cursor) : undefined;
    const transactions: NormalizedTransaction[] = [];
    let endReason: string | null = null;
    let lastCursor: Uint8Array | null = null;

    for (let round = 0; round < MAX_SCAN_ROUNDS && transactions.length < limit; round++) {
      const frames = await this.client.serverStream("ledger", "ListTransactions", {
        read_mask: TX_READ_MASK,
        filter: { terms: [{ literals: [{ affected_address: { address } }] }] },
        options: {
          limit: limit - transactions.length,
          ordering: "ORDERING_DESCENDING",
          ...(before ? { before } : {}),
        },
      });
      const collected = collectTransactionFrames(frames);
      transactions.push(...collected.transactions);
      endReason = collected.endReason;
      lastCursor = collected.lastCursor ?? lastCursor;
      if (endReason !== "QUERY_END_REASON_SCAN_LIMIT" || !collected.lastCursor) break;
      before = collected.lastCursor;
    }

    return {
      transactions,
      nextCursor: hasMoreHistory(endReason) && lastCursor ? encodeCursor(lastCursor) : null,
      endReason,
    };
  }

  async getTransaction(digest: string): Promise<NormalizedTransaction> {
    const raw = (await this.client.unary<{ transaction?: unknown }>("ledger", "GetTransaction", {
      digest,
      read_mask: TX_READ_MASK,
    })).transaction;
    if (!raw) throw new ProviderError("tatum", "PROVIDER_NOT_FOUND", `Transaction ${digest} not found.`);
    return normalizeExecutedTransaction(raw);
  }
}

let provider: SuiTatumProvider | undefined;

/** Process-wide provider built from validated env. Throws ConfigError if Tatum is not configured. */
export function getSuiProvider(): SuiTatumProvider {
  if (provider) return provider;
  const e = env();
  if (!e.tatum.apiKey) {
    throw new ConfigError("Tatum is not configured. Set TATUM_API_KEY (a Sui Testnet key) in .env.local.", "CONFIG_MISSING");
  }
  provider = new SuiTatumProvider(new TatumGrpcClient(e.tatum.grpcEndpoint, e.tatum.apiKey, e.tatum.maxRequestsPerSecond, new SharedRequestBudget(getKv, e.tatum.maxRequestsPerSecond)), e.network);
  return provider;
}
