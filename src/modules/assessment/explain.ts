import { formatAmount } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import type { AgentContext, ContextItem, ContextKind } from "@/modules/ai/ai.types";
import type { FindingCategory, TransferAssessment } from "./transfer.types";

/** Prompt addition for explaining a simulated transfer. The model explains; the verdict is fixed. */
export const TRANSFER_EXPLAIN_SYSTEM = `This request explains a SIMULATED transfer that was NOT signed or sent.
- The verdict and every figure were computed deterministically; explain them, never change or recompute them.
- Distinguish clearly: confirmed facts, historical patterns, the user's own preferences or decisions (including past reviews, which are not confirmed evidence), and unknowns.
- Never say the transfer or recipient is safe, and never say a transaction will succeed. "No issues found" only means no issues in the available data.
- Gas figures are estimates from history, not quotes.`;

const KIND: Record<FindingCategory, ContextKind> = { fact: "calculation", pattern: "calculation", preference: "preference", unknown: "calculation" };
const LABEL: Record<FindingCategory, string> = { fact: "Confirmed fact", pattern: "Historical pattern", preference: "Your preference or decision", unknown: "Unknown" };

/** Context built only from the server-computed assessment (never from client input). */
export function transferContext(a: TransferAssessment): AgentContext {
  const items: ContextItem[] = [];
  let o = 0, c = 0, p = 0, m = 0;
  const push = (kind: ContextKind, source: string, asOf: string | null, text: string, untrusted = false) => {
    const id = kind === "onchain" ? `O${++o}` : kind === "calculation" ? `C${++c}` : kind === "preference" ? `P${++p}` : `M${++m}`;
    items.push({ id, kind, source, asOf, text: text.slice(0, 420), ...(untrusted ? { untrusted } : {}) });
  };
  const unit = a.asset.symbol ?? "units";
  push("calculation", "Transfer simulation (deterministic)", a.generatedAt, `Simulated transfer of ${formatAmount(a.amount, 6)} ${unit} from ${shortAddress(a.wallet)} to ${shortAddress(a.recipient)}. Nothing was signed or sent. Verdict: ${a.verdictTitle}. ${a.verdictSummary}`);
  push("onchain", `Tatum Sui ${a.source.network}`, a.source.fetchedAt, `Balance before: ${formatAmount(a.save.balanceBefore, 6)} ${unit}; SUI for gas: ${formatAmount(a.save.suiBefore, 9)} SUI.`);
  if (a.gas.estimateMist) push("calculation", "Gas estimate (historical median, not a quote)", null, `Estimated gas ${formatAmount((Number(a.gas.estimateMist) / 1e9).toFixed(9), 9)} SUI from ${a.gas.samples} past transactions.`);
  push("calculation", "Conservative available amount", null, `Estimated available ${formatAmount(a.spendable.estimatedAvailable, 6)} ${unit} of ${formatAmount(a.spendable.totalBalance, 6)} total. ${a.spendable.notes.join(" ")}`);
  for (const f of a.findings) push(KIND[f.category], `${LABEL[f.category]} · ${f.pillar}`, null, `${f.title}. ${f.detail}`);
  for (const it of a.memory.items) push("memory", `memory · ${it.source}`, it.createdAt, it.summary, true);
  return {
    address: a.wallet,
    network: a.source.network,
    items,
    sections: [
      { name: "security", status: "ok", detail: `pre-execution score ${a.protect.score}` },
      { name: "savings", status: a.save.status === "computed" ? "ok" : "unavailable", detail: a.save.reason ?? "computed" },
      { name: "strategy", status: a.invest.status === "computed" ? "ok" : "unavailable", detail: a.invest.reason ?? "computed" },
      { name: "memory", status: a.memory.status === "applied" ? (a.memory.items.length ? "ok" : "empty") : "unavailable", detail: a.memory.detail },
    ],
  };
}
