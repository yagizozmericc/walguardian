import "server-only";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { Transaction, TransactionDataBuilder, coinWithBalance } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import type { SuiClientTypes } from "@mysten/sui/client";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { AppError, ConfigError, ValidationError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { parseUnits } from "@/lib/units";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { mapRpcError } from "@/modules/blockchain/sui.sdk";
import { assessTransferRequest } from "@/modules/assessment/transfer.service";
import type { TransferRequest } from "@/modules/assessment/transfer.types";
import type { MemoryService } from "@/modules/memory/memory.service";
import { SUI_COIN_TYPE } from "@/modules/portfolio/assets";
import type { ExecuteRequest, ExecutionResult, PreparedTransfer, SimulationView } from "./execution.types";
import { checkTransferIntent, labelBalanceChanges, signingPolicy, summarizeGas } from "./simulation";
import { issueTicket, verifyTicket } from "./ticket";

/**
 * Builds a plain transfer with the official SDK, simulates it on the node
 * through Tatum, and later broadcasts the wallet-signed bytes through Tatum.
 * Guardian never holds a key and never signs.
 */

/** gRPC codes that mean the provider failed, not that the transaction is invalid. */
const PROVIDER_CODES = new Set(["UNAVAILABLE", "DEADLINE_EXCEEDED", "RESOURCE_EXHAUSTED", "UNAUTHENTICATED", "PERMISSION_DENIED", "UNIMPLEMENTED", "INTERNAL", "UNKNOWN"]);

function rpcCause(err: unknown): RpcError | null {
  for (let e = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    if (e instanceof RpcError) return e;
  }
  return null;
}

/** Provider outages are rethrown as typed errors; anything else is a reason the transaction itself is invalid. */
function transactionProblem(err: unknown, method: string): string {
  const rpc = rpcCause(err);
  if (rpc && PROVIDER_CODES.has(rpc.code)) throw mapRpcError(rpc, method);
  if (err instanceof AppError) throw err;
  return (rpc?.message ?? (err instanceof Error ? err.message : String(err))).slice(0, 400);
}

function ticketKey(): string {
  const key = env().tatum.apiKey;
  if (!key) throw new ConfigError("Tatum is not configured. Set TATUM_API_KEY (a Sui Testnet key) in .env.local.", "CONFIG_MISSING");
  return key;
}

const INCLUDE: { effects: true; balanceChanges: true } = { effects: true, balanceChanges: true };

/** The SDK's conditional include types widen to never here; effects are requested via INCLUDE. */
const effectsOf = (t: { effects?: unknown }) => t.effects as SuiClientTypes.TransactionEffects | undefined;

export async function prepareTransfer(
  provider: SuiTatumProvider,
  client: SuiGrpcClient,
  wallet: string,
  req: TransferRequest,
  memory: MemoryService | null,
): Promise<PreparedTransfer> {
  await provider.assertNetwork();
  const assessment = await assessTransferRequest(provider, wallet, req, memory);
  const amountRaw = parseUnits(assessment.amount, assessment.asset.decimals);
  const network = assessment.source.network;

  if (assessment.verdict === "insufficient_balance") {
    return { assessment, simulation: null, buildError: null, transaction: null, signing: signingPolicy(assessment, null, null) };
  }

  const tx = new Transaction();
  tx.setSender(wallet);
  tx.transferObjects([coinWithBalance({ type: assessment.asset.coinType, balance: amountRaw })], assessment.recipient);

  let bytes: Uint8Array;
  try {
    bytes = await tx.build({ client });
  } catch (err) {
    const buildError = transactionProblem(err, "BuildTransaction");
    logger.warn("execution.build_failed", { message: buildError });
    return { assessment, simulation: null, buildError, transaction: null, signing: signingPolicy(assessment, null, buildError) };
  }

  let sim: Awaited<ReturnType<SuiGrpcClient["core"]["simulateTransaction"]>>;
  try {
    sim = await client.core.simulateTransaction({ transaction: bytes, include: INCLUDE });
  } catch (err) {
    const buildError = transactionProblem(err, "SimulateTransaction");
    return { assessment, simulation: null, buildError, transaction: null, signing: signingPolicy(assessment, null, buildError) };
  }

  const t = sim.$kind === "Transaction" ? sim.Transaction : sim.FailedTransaction;
  const gas = summarizeGas(effectsOf(t)?.gasUsed);
  const balanceChanges = labelBalanceChanges(t.balanceChanges ?? [], wallet, assessment.recipient);
  const simulation: SimulationView = {
    status: t.status.success ? "success" : "failed",
    error: t.status.success ? null : t.status.error.message,
    gas,
    gasPaymentMocked: sim.gasPaymentMocked,
    balanceChanges,
    intent: checkTransferIntent(balanceChanges, gas, { sender: wallet, recipient: assessment.recipient, coinType: assessment.asset.coinType, amountRaw, suiCoinType: SUI_COIN_TYPE }),
    simulatedAt: new Date().toISOString(),
    source: { provider: "tatum", network },
  };

  const signing = signingPolicy(assessment, simulation, null);
  const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
  const { ticket, expiresAtMs } = issueTicket(ticketKey(), digest, wallet, Date.now());
  return {
    assessment,
    simulation,
    buildError: null,
    transaction: signing.allowed ? { bytes: toBase64(bytes), digest, ticket, expiresAt: new Date(expiresAtMs).toISOString() } : null,
    signing,
  };
}

export async function executeSigned(provider: SuiTatumProvider, client: SuiGrpcClient, wallet: string, req: ExecuteRequest): Promise<ExecutionResult> {
  let bytes: Uint8Array;
  let sender: string | null;
  try {
    bytes = fromBase64(req.transaction);
    sender = TransactionDataBuilder.fromBytes(bytes).sender ?? null;
  } catch {
    throw new ValidationError("The transaction bytes could not be decoded.");
  }
  if (sender !== wallet) throw new ValidationError("The transaction sender is not the connected wallet.");
  const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
  const check = verifyTicket(ticketKey(), req.ticket, digest, wallet, Date.now());
  if (!check.ok) {
    throw new ValidationError(
      check.reason === "expired"
        ? "This prepared transaction expired. Check the transfer again to rebuild and re-simulate it."
        : "These bytes are not the transaction Guardian assessed, so they will not be broadcast.",
    );
  }

  await provider.assertNetwork();
  let res: Awaited<ReturnType<SuiGrpcClient["core"]["executeTransaction"]>>;
  try {
    res = await client.core.executeTransaction({ transaction: bytes, signatures: [req.signature], include: INCLUDE });
  } catch (err) {
    throw new ValidationError(`The network rejected the transaction: ${transactionProblem(err, "ExecuteTransaction")}`);
  }
  const t = res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
  logger.info("execution.executed", { digest: t.digest, success: t.status.success });
  return {
    digest: t.digest,
    status: t.status.success ? "success" : "failed",
    error: t.status.success ? null : t.status.error.message,
    gas: summarizeGas(effectsOf(t)?.gasUsed),
    balanceChanges: labelBalanceChanges(t.balanceChanges ?? [], wallet, null),
    executedAt: new Date().toISOString(),
    source: { provider: "tatum", network: env().network },
  };
}
