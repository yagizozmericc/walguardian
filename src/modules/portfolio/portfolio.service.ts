import "server-only";
import { formatUnits } from "@/lib/units";
import { logger } from "@/lib/logger";
import type { BlockchainProvider, CoinMetadata } from "@/modules/blockchain/blockchain.types";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { classifyAsset } from "./assets";
import { deriveActivity } from "./activity";
import type { Holding, PortfolioSnapshot } from "./portfolio.types";

const METADATA_CONCURRENCY = 2;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Fetches metadata per coin type; a failed lookup leaves that coin's decimals unknown instead of guessed. */
async function loadMetadata(
  provider: BlockchainProvider,
  coinTypes: string[],
  warnings: string[],
): Promise<Map<string, CoinMetadata>> {
  const map = new Map<string, CoinMetadata>();
  await mapLimit(coinTypes, METADATA_CONCURRENCY, async (coinType) => {
    try {
      map.set(coinType, await provider.getCoinMetadata(coinType));
    } catch (err) {
      logger.warn("portfolio.metadata_unavailable", { coinType, message: (err as Error).message });
      warnings.push(`Metadata unavailable for ${coinType}; amount shown in raw units.`);
    }
  });
  return map;
}

export async function getPortfolioSnapshot(
  provider: SuiTatumProvider,
  address: string,
  opts: { activityLimit?: number; cursor?: string } = {},
): Promise<PortfolioSnapshot> {
  const chain = await provider.assertNetwork();
  const [balances, page] = await Promise.all([
    provider.getBalances(address),
    provider.getTransactions(address, { limit: opts.activityLimit ?? 50, cursor: opts.cursor }),
  ]);

  const warnings: string[] = [];
  const coinTypes = new Set(balances.map((b) => b.coinType));
  for (const tx of page.transactions) for (const c of tx.balanceChanges) if (c.address === address) coinTypes.add(c.coinType);
  const metadata = await loadMetadata(provider, [...coinTypes], warnings);

  const source = provider.source();
  const holdings: Holding[] = balances
    .map((b) => {
      const meta = metadata.get(b.coinType);
      const decimals = meta?.decimals ?? null;
      const { assetClass, reference } = classifyAsset(source.network, b.coinType);
      return {
        coinType: b.coinType,
        symbol: meta?.symbol ?? null,
        name: meta?.name ?? null,
        decimals,
        rawBalance: b.balance,
        amount: decimals === null ? null : formatUnits(b.balance, decimals),
        assetClass,
        classificationReference: reference,
      };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.symbol ?? a.coinType).localeCompare(b.symbol ?? b.coinType));

  if (chain.lowestAvailableCheckpoint && chain.lowestAvailableCheckpoint !== "0") {
    warnings.push(
      `The node serves history from checkpoint ${chain.lowestAvailableCheckpoint}; older activity may be pruned.`,
    );
  }

  return {
    address,
    network: source.network,
    chain,
    holdings,
    activity: page.transactions.map((tx) => deriveActivity(tx, address, metadata)),
    activityCursor: page.nextCursor,
    valuation: {
      status: "unavailable",
      reason:
        source.network === "testnet"
          ? "Testnet assets have no market price. Balances are shown in token units."
          : "No price source is configured. Balances are shown in token units.",
    },
    source,
    warnings,
  };
}

function rank(h: Holding): number {
  return h.assetClass === "native" ? 0 : h.assetClass === "stablecoin" ? 1 : 2;
}
