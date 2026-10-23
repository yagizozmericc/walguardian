import "server-only";
import { ValidationError } from "@/lib/errors";
import { parseUnits } from "@/lib/units";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { SUI_COIN_TYPE, classifyAsset, knownAssets, normalizeCoinType } from "@/modules/portfolio/assets";
import { loadCoinMetadata } from "@/modules/portfolio/metadata";
import { resolvePrices } from "@/modules/pricing/pricing.service";
import { USD_DECIMALS, evaluateAllocation, type BuyAsset, type EnginePrice } from "./allocation.engine";
import type { AllocationClass, StrategyEvaluation, StrategySettings } from "./strategy.types";

/**
 * Allocation analysis for an address. Balances and coin metadata come from
 * Tatum; prices come only through the provider-neutral resolver (market first,
 * then the user's reference prices, which are labelled as assumptions).
 */
export async function evaluateStrategy(
  provider: SuiTatumProvider,
  address: string,
  rawSettings: StrategySettings,
  earmarks: { coinType: string; amount: string }[],
): Promise<StrategyEvaluation> {
  const settings: StrategySettings = {
    ...rawSettings,
    referencePrices: rawSettings.referencePrices.map((r) => ({ ...r, coinType: normalizeCoinType(r.coinType) })),
    excluded: rawSettings.excluded.map(normalizeCoinType),
  };
  await provider.assertNetwork();
  const network = provider.source().network;
  const balances = await provider.getBalances(address);

  const registry = knownAssets(network);
  const coinTypes = [
    ...new Set([...balances.map((b) => b.coinType), ...earmarks.map((e) => normalizeCoinType(e.coinType)), ...registry.map((r) => r.coinType)]),
  ];
  const metadata = await loadCoinMetadata(provider, coinTypes, []);

  const earmarkedRaw = new Map<string, bigint>();
  for (const e of earmarks) {
    const coinType = normalizeCoinType(e.coinType);
    const decimals = metadata.get(coinType)?.decimals;
    if (decimals == null) throw new ValidationError(`Decimals for earmarked asset ${coinType} are unavailable.`);
    try {
      earmarkedRaw.set(coinType, (earmarkedRaw.get(coinType) ?? 0n) + parseUnits(e.amount, decimals));
    } catch (err) {
      throw new ValidationError(`Earmark for ${coinType}: ${(err as Error).message}`);
    }
  }

  const priced = await resolvePrices(network, coinTypes, settings.referencePrices);
  const prices = new Map<string, EnginePrice>();
  for (const p of priced) {
    if (p.status === "available") prices.set(p.coinType, { priceE8: parseUnits(p.price, USD_DECIMALS), value: p.price, basis: p.basis, asOf: p.asOf });
  }

  const defaultBuyAssets: Partial<Record<AllocationClass, BuyAsset>> = {};
  for (const r of registry) {
    const decimals = metadata.get(r.coinType)?.decimals;
    if (decimals == null || r.assetClass === "other" || defaultBuyAssets[r.assetClass]) continue;
    defaultBuyAssets[r.assetClass] = { coinType: r.coinType, symbol: r.symbol, decimals };
  }

  const result = evaluateAllocation({
    holdings: balances.map((b) => {
      const meta = metadata.get(b.coinType);
      return {
        coinType: b.coinType,
        symbol: meta?.symbol ?? null,
        decimals: meta?.decimals ?? null,
        assetClass: classifyAsset(network, b.coinType).assetClass,
        rawBalance: BigInt(b.balance),
      };
    }),
    prices,
    settings,
    earmarkedRaw,
    defaultBuyAssets,
    suiCoinType: SUI_COIN_TYPE,
  });

  const source = provider.source();
  return {
    address,
    ...result,
    pricing: {
      basis: "user_reference",
      note:
        network === "testnet"
          ? "Testnet assets have no market price. All values use reference prices you entered; they are assumptions, not market data."
          : "Values use reference prices you entered where no market price is available.",
    },
    source: { provider: "tatum", network: source.network, fetchedAt: source.fetchedAt },
  };
}
