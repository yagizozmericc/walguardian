import { z } from "zod";
import type { TransferAssessment } from "@/modules/assessment/transfer.types";

/**
 * Wallet-signed execution contracts. Guardian builds and simulates a transfer
 * through Tatum, the user's own wallet signs it, and Guardian broadcasts it
 * through Tatum only if the signed bytes are the ones it assessed.
 */

const Base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "Expected base64.");

export const ExecuteRequestSchema = z.object({
  address: z.string(),
  /** BCS TransactionData exactly as returned by /prepare and signed by the wallet. */
  transaction: Base64.max(64 * 1024),
  /** zkLogin and passkey signatures are several KB, so the cap is generous. */
  signature: Base64.max(16 * 1024),
  ticket: z.string().max(512),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export interface SimulatedBalanceChange {
  address: string;
  coinType: string;
  /** Signed raw amount (base units). */
  amount: string;
  role: "sender" | "recipient" | "other";
}

export interface GasSummary {
  computationMist: string;
  storageMist: string;
  rebateMist: string;
  /** computation + storage − rebate; what the sender pays. Can be negative when rebates exceed costs. */
  netMist: string;
}

export interface SimulationView {
  status: "success" | "failed";
  error: string | null;
  gas: GasSummary | null;
  /** The node simulated with a mocked gas coin, so the sender's own funds were not exercised. */
  gasPaymentMocked: boolean;
  balanceChanges: SimulatedBalanceChange[];
  /** Does the simulated outcome do exactly what the user asked for? */
  intent: { matches: boolean; issues: string[] };
  simulatedAt: string;
  source: { provider: "tatum"; network: string };
}

export interface SigningPolicy {
  allowed: boolean;
  /** The user must explicitly acknowledge the warnings before the wallet is asked to sign. */
  requiresAcknowledgement: boolean;
  reasons: string[];
}

export interface PreparedTransfer {
  assessment: TransferAssessment;
  /** Null when the transaction could not be built (for example, insufficient funds). */
  simulation: SimulationView | null;
  buildError: string | null;
  transaction: { bytes: string; digest: string; ticket: string; expiresAt: string } | null;
  signing: SigningPolicy;
}

export interface ExecutionResult {
  digest: string;
  status: "success" | "failed";
  error: string | null;
  gas: GasSummary | null;
  balanceChanges: SimulatedBalanceChange[];
  executedAt: string;
  source: { provider: "tatum"; network: string };
}
