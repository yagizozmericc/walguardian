/**
 * Live smoke test for the Tatum Sui gRPC integration (no mocks).
 *
 *   npm run check:tatum -- [0xADDRESS]
 *
 * Reads TATUM_API_KEY / SUI_NETWORK from .env.local. Prints chain identity,
 * then balances and recent transactions for the address, if given.
 */
import { SuiAddressSchema } from "@/lib/sui-address";
import { AppError } from "@/lib/errors";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { getPortfolioSnapshot } from "@/modules/portfolio/portfolio.service";

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const provider = getSuiProvider();
  const chain = await provider.assertNetwork();
  console.log("chain:", chain);

  const arg = process.argv[2];
  if (!arg) return;
  const address = SuiAddressSchema.parse(arg);

  const snapshot = await getPortfolioSnapshot(provider, address, { activityLimit: 20 });
  console.log("\nholdings:");
  console.table(snapshot.holdings.map((h) => ({ symbol: h.symbol, amount: h.amount, class: h.assetClass, coinType: h.coinType })));
  console.log(`\nactivity (${snapshot.activity.length}, next cursor: ${snapshot.activityCursor ? "yes" : "none"}):`);
  console.table(
    snapshot.activity.map((a) => ({
      digest: a.digest,
      time: a.timestampMs ? new Date(a.timestampMs).toISOString() : null,
      dir: a.direction,
      transfers: a.transfers.map((t) => `${t.amount ?? t.rawAmount} ${t.symbol ?? "?"}`).join(", "),
      counterparties: a.counterparties.length,
    })),
  );
  if (snapshot.warnings.length) console.log("\nwarnings:", snapshot.warnings);
}

main()
  .catch((err) => {
    if (err instanceof AppError) console.error(`\n${err.code}: ${err.message}`);
    else console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
