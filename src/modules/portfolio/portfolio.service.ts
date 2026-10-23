import "server-only";
import { formatUnits } from "@/lib/units";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { classifyAsset } from "./assets";
import { deriveActivity } from "./activity";
import { loadCoinMetadata } from "./metadata";
import { getPriceProvider } from "@/modules/pricing/pricing.service";
import type { Holding, PortfolioSnapshot } from "./portfolio.types";

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
  const metadata = await loadCoinMetadata(provider, [...coinTypes], warnings);

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
    valuation: await valuationFor(source.network, holdings.map((h) => h.coinType)),
    source,
    warnings,
  };
}

function rank(h: Holding): number {
  return h.assetClass === "native" ? 0 : h.assetClass === "stablecoin" ? 1 : 2;
}

/** Fiat valuation is offered only when every holding has a sourced price; otherwise it is unavailable. */
async function valuationFor(network: PortfolioSnapshot["network"], coinTypes: string[]): Promise<PortfolioSnapshot["valuation"]> {
  const results = await getPriceProvider().getPrices(network, coinTypes);
  const missing = results.find((r) => r.status === "unavailable");
  return {
    status: "unavailable",
    reason: `${missing?.status === "unavailable" ? missing.reason : "No price provider is configured."} Balances are shown in token units.`,
  };
}
