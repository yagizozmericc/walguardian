/**
 * FIXTURE DEMO — runs the Protect scoring engine on deterministic synthetic
 * scenarios (tests/fixtures/protect.fixture.ts). No network calls; output is
 * labelled as fixture data and is not a statement about any real wallet.
 *
 *   npm run demo:protect
 */
import { assessCandidate } from "@/modules/security/risk.engine";
import type { Candidate } from "@/modules/security/security.types";
import { KNOWN, NEXT_T, STRANGER, SUI, SUI_UNIT, UNKNOWN_PKG, balances, regularHistory } from "../tests/fixtures/protect.fixture";

const c = (amount: number, recipient: string, packages: string[] = []): Candidate => ({
  timestampMs: NEXT_T,
  outflows: [{ coinType: SUI, symbol: "SUI", decimals: 9, rawAmount: BigInt(amount) * SUI_UNIT }],
  recipients: [recipient],
  packages,
});

const scenarios: [string, Candidate, number][] = [
  ["Normal: 10 SUI to a known recipient", c(10, KNOWN[0]), 1000],
  ["Large: 100 SUI to a known recipient", c(100, KNOWN[0]), 1000],
  ["New recipient: 10 SUI", c(10, STRANGER), 1000],
  ["Outflow: 10 SUI from an 11 SUI balance", c(10, KNOWN[0]), 11],
  ["Combined: 100 SUI to a new recipient via a new package, 95% of balance", c(100, STRANGER, [UNKNOWN_PKG]), 105],
];

console.log("FIXTURE DEMO — synthetic history: 20 transfers of 8–12 SUI every 12h to 3 known recipients\n");
for (const [label, candidate, bal] of scenarios) {
  const a = assessCandidate(candidate, regularHistory(), balances(bal));
  console.log(`${label}\n  score ${a.score} · ${a.severity} · confidence ${a.confidence}`);
  for (const s of a.signals) console.log(`  +${s.points}${s.critical ? " [critical]" : ""} ${s.title}: ${s.explanation}`);
  console.log();
}
