import "server-only";
import { logger } from "@/lib/logger";
import type { ChainInfo, DataSource, NormalizedTransaction, RawBalance } from "@/modules/blockchain/blockchain.types";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { MAX_TX_PAGE } from "@/modules/blockchain/sui.adapter";
import { deriveActivity } from "./activity";
import { loadCoinMetadata } from "./metadata";
import type { ActivityItem } from "./portfolio.types";

/** Upper bound on history loaded for behavioral analysis (free-tier rate limits apply). */
export const MAX_ANALYSIS_TRANSACTIONS = 200;
const CACHE_TTL_MS = 30_000;

export interface AddressHistory {
  chain: ChainInfo;
  balances: RawBalance[];
  /** Contiguous, newest first. */
  transactions: NormalizedTransaction[];
  activity: ActivityItem[];
  /** True when the provider reported the end of available history within the bound. */
  complete: boolean;
  source: DataSource;
  warnings: string[];
}

const cache = new Map<string, { at: number; value: Promise<AddressHistory> }>();

async function loadTransactions(provider: SuiTatumProvider, address: string, max: number) {
  const transactions: NormalizedTransaction[] = [];
  let cursor: string | undefined;
  let complete = false;
  while (transactions.length < max) {
    const page = await provider.getTransactions(address, { limit: Math.min(MAX_TX_PAGE, max - transactions.length), cursor });
    transactions.push(...page.transactions);
    if (!page.nextCursor) {
      complete = true;
      break;
    }
    cursor = page.nextCursor;
  }
  return { transactions, complete };
}

async function load(provider: SuiTatumProvider, address: string, max: number): Promise<AddressHistory> {
  const chain = await provider.assertNetwork();
  let { transactions, complete } = await loadTransactions(provider, address, max);
  let balances = await provider.getBalances(address);

  // Balances and history must describe the same moment for balance reconstruction.
  // If a new transaction landed in between, reload once.
  const head = await provider.getTransactions(address, { limit: 1 });
  if (head.transactions[0] && head.transactions[0].digest !== transactions[0]?.digest) {
    logger.info("history.reload_after_new_tx", { address });
    ({ transactions, complete } = await loadTransactions(provider, address, max));
    balances = await provider.getBalances(address);
  }

  const warnings: string[] = [];
  const coinTypes = new Set(balances.map((b) => b.coinType));
  for (const tx of transactions) for (const c of tx.balanceChanges) if (c.address === address) coinTypes.add(c.coinType);
  const metadata = await loadCoinMetadata(provider, [...coinTypes], warnings);

  return {
    chain,
    balances,
    transactions,
    activity: transactions.map((tx) => deriveActivity(tx, address, metadata)),
    complete,
    source: provider.source(),
    warnings,
  };
}

/** Recent contiguous history plus balances for an address, cached briefly to respect rate limits. */
export function getAddressHistory(
  provider: SuiTatumProvider,
  address: string,
  opts: { max?: number; fresh?: boolean } = {},
): Promise<AddressHistory> {
  const max = opts.max ?? MAX_ANALYSIS_TRANSACTIONS;
  const key = `${address}:${max}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = load(provider, address, max);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}
