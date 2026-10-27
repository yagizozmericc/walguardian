import { normalizeCoinType } from "@/modules/portfolio/assets";
import { INSUFFICIENT_GAS_TITLE } from "@/modules/assessment/transfer.engine";
import type { TransferAssessment } from "@/modules/assessment/transfer.types";
import type { GasSummary, SigningPolicy, SimulatedBalanceChange, SimulationView } from "./execution.types";

/**
 * Pure interpretation of a node simulation. Nothing here talks to the network,
 * so every rule is deterministic and tested.
 */

export interface TransferIntent {
  sender: string;
  recipient: string;
  coinType: string;
  amountRaw: bigint;
  suiCoinType: string;
}

export interface RawGasUsed {
  computationCost: string;
  storageCost: string;
  storageRebate: string;
}

export interface RawBalanceChange {
  address: string;
  coinType: string;
  amount: string;
}

export function summarizeGas(g: RawGasUsed | null | undefined): GasSummary | null {
  if (!g) return null;
  const net = BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate);
  return { computationMist: g.computationCost, storageMist: g.storageCost, rebateMist: g.storageRebate, netMist: net.toString() };
}

export function labelBalanceChanges(changes: RawBalanceChange[], sender: string, recipient: string | null): SimulatedBalanceChange[] {
  return changes.map((c) => ({
    address: c.address,
    coinType: normalizeCoinType(c.coinType),
    amount: c.amount,
    role: c.address === sender ? "sender" : c.address === recipient ? "recipient" : "other",
  }));
}

/**
 * Checks that the simulated balance changes are exactly the requested
 * transfer: the recipient gains the amount, the sender loses the amount plus
 * gas (gas only in SUI), and no other address or asset moves.
 */
export function checkTransferIntent(changes: SimulatedBalanceChange[], gas: GasSummary | null, intent: TransferIntent): { matches: boolean; issues: string[] } {
  const issues: string[] = [];
  const coinType = normalizeCoinType(intent.coinType);
  const sui = normalizeCoinType(intent.suiCoinType);
  const net = (address: string, type: string) =>
    changes.filter((c) => c.address === address && c.coinType === type).reduce((s, c) => s + BigInt(c.amount), 0n);

  const received = net(intent.recipient, coinType);
  if (received !== intent.amountRaw) issues.push(`Recipient would receive ${received} base units instead of the requested ${intent.amountRaw}.`);

  if (!gas) issues.push("The simulation reported no gas cost, so the sender's total outflow cannot be confirmed.");
  const gasNet = gas ? BigInt(gas.netMist) : 0n;
  if (coinType === sui) {
    const expected = -(intent.amountRaw + gasNet);
    const sent = net(intent.sender, sui);
    if (gas && sent !== expected) issues.push(`Sender SUI would change by ${sent} instead of the expected ${expected} (amount plus gas).`);
  } else {
    const sent = net(intent.sender, coinType);
    if (sent !== -intent.amountRaw) issues.push(`Sender would send ${-sent} base units instead of the requested ${intent.amountRaw}.`);
    const gasPaid = net(intent.sender, sui);
    if (gas && gasPaid !== -gasNet) issues.push(`Sender SUI would change by ${gasPaid}, which does not match the simulated gas of ${-gasNet}.`);
  }

  for (const c of changes) {
    if (c.address !== intent.sender && c.address !== intent.recipient) issues.push(`An unexpected address (${c.address}) would see a balance change.`);
    else if (c.coinType !== coinType && c.coinType !== sui) issues.push(`An unexpected asset (${c.coinType}) would move.`);
    else if (c.address === intent.recipient && c.coinType !== coinType) issues.push(`The recipient would also see a change in ${c.coinType}.`);
  }
  return { matches: issues.length === 0, issues: [...new Set(issues)] };
}

/**
 * Whether the wallet may be asked to sign. Hard stops cover what would fail
 * or differ from the request; warnings only require an explicit
 * acknowledgement, because the user, not Guardian, decides. Memory or past
 * feedback never removes a critical acknowledgement.
 *
 * The assessment's gas check is a historical estimate, so it does not block
 * on its own: the node's simulation is authoritative for gas.
 */
export function signingPolicy(a: TransferAssessment, simulation: SimulationView | null, buildError: string | null): SigningPolicy {
  const blockers: string[] = [];
  if (a.verdict === "insufficient_balance") blockers.push(a.verdictTitle);
  if (buildError) blockers.push(`The transaction could not be built: ${buildError}`);
  if (simulation?.status === "failed") blockers.push(`The simulation failed: ${simulation.error ?? "unknown error"}`);
  if (simulation?.gasPaymentMocked) blockers.push("The simulation used a mocked gas coin, so it does not reflect this wallet's funds.");
  if (simulation && simulation.status === "success" && !simulation.intent.matches) blockers.push("The simulated outcome does not match the requested transfer.");
  if (blockers.length === 0 && !simulation) blockers.push("No simulation is available.");
  if (blockers.length > 0) return { allowed: false, requiresAcknowledgement: false, reasons: blockers };

  const warnings: string[] = [];
  const critical = a.findings.filter((f) => f.level === "critical" && f.title !== INSUFFICIENT_GAS_TITLE);
  if (a.verdict === "review_carefully") warnings.push(a.verdictTitle);
  for (const f of critical) warnings.push(f.title);
  if (a.protect.severity === "high") warnings.push(`Protect score ${a.protect.score}/100 (high).`);
  return { allowed: true, requiresAcknowledgement: warnings.length > 0, reasons: [...new Set(warnings)] };
}
