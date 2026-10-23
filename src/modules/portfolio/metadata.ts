import "server-only";
import { logger } from "@/lib/logger";
import type { BlockchainProvider, CoinMetadata } from "@/modules/blockchain/blockchain.types";

const METADATA_CONCURRENCY = 2;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Fetches metadata per coin type; a failed lookup leaves that coin's decimals unknown instead of guessed. */
export async function loadCoinMetadata(
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
