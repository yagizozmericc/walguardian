/**
 * Live Protect run against Tatum Sui Testnet (no mocks).
 *
 *   npm run check:protect -- 0xADDRESS
 */
import { existsSync } from "node:fs";
import { AppError } from "@/lib/errors";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { getSecurityReport } from "@/modules/security/security.service";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function main() {
  const address = SuiAddressSchema.parse(process.argv[2]);
  const r = await getSecurityReport(getSuiProvider(), address);
  console.log(`status: ${r.status} — ${r.statusSummary}`);
  console.log(`analysed: ${r.analysedTransactionCount} txs (complete: ${r.historyComplete}), assessed sent txs: ${r.assessed.length}`);
  console.log("severity:", r.severityCounts);
  const b = r.baseline;
  console.log(
    `baseline: sent ${b.sentCount}, outgoing ${b.outgoingTransferCount}, confidence ${b.confidence}, recipients ${b.recipients.length}, novelty ${b.recipientNoveltyRate?.toFixed(2) ?? "n/a"}, packages ${b.packages.length}, daily ${b.dailySentMean?.toFixed(2) ?? "n/a"}`,
  );
  console.table(b.amountStats.map((s) => ({ coin: s.symbol, n: s.count, median: s.median, p95: s.p95, max: s.max })));
  for (const a of r.assessed.slice(0, 6)) {
    console.log(`\n${a.digest}  score=${a.assessment.score} ${a.assessment.severity} conf=${a.assessment.confidence} baseline=${a.assessment.baselineSize}`);
    for (const s of a.assessment.signals) console.log(`  +${s.points}${s.critical ? " CRITICAL" : ""} ${s.rule}: ${s.explanation}`);
    for (const n of a.assessment.notes) console.log(`  note: ${n}`);
    for (const l of a.assessment.limitations) console.log(`  limit ${l.rule}: ${l.reason}`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof AppError ? `${err.code}: ${err.message}` : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
