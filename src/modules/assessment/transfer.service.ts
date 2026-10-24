import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { todayUtc } from "@/lib/dates";
import { AppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { SuiAddressSchema } from "@/lib/sui-address";
import { parseUnits } from "@/lib/units";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { listDecisions, listFeedback, listGoals, loadStrategy } from "@/modules/memory/memory.repositories";
import type { MemoryService } from "@/modules/memory/memory.service";
import { SUI_COIN_TYPE, classifyAsset, knownAssets, normalizeCoinType } from "@/modules/portfolio/assets";
import { getAddressHistory } from "@/modules/portfolio/history.service";
import { resolvePrices } from "@/modules/pricing/pricing.service";
import { openTransactions, getSecurityReport } from "@/modules/security/security.service";
import { USD_DECIMALS, type BuyAsset, type EngineHolding, type EnginePrice } from "@/modules/strategy/allocation.engine";
import type { AllocationClass } from "@/modules/strategy/strategy.types";
import { lookupRecipient } from "./recipient";
import { DISCLAIMER, assessTransfer, computeSpendable, estimateGas, type AssessmentInput } from "./transfer.engine";
import type { SpendableBreakdown, TransferAssessment, TransferRequest } from "./transfer.types";

/** Gathers inputs (Tatum, memory, pricing) and runs the deterministic assessment. Simulation only. */

const TransferCheckDataSchema = z.object({
  recipient: z.string(),
  coinType: z.string(),
  amount: z.string(),
  decision: z.enum(["would_proceed", "would_not_proceed"]),
  note: z.string().nullable(),
});

export const TRANSFER_CHECK_PREFIX = "transfer-check:";

async function loadBase(provider: SuiTatumProvider, wallet: string, rawCoinType: string) {
  const history = await getAddressHistory(provider, wallet);
  const network = history.source.network;
  const coinType = normalizeCoinType(rawCoinType);
  const balances = new Map(history.balances.map((b) => [b.coinType, BigInt(b.balance)]));
  const registry = knownAssets(network);
  if (!balances.has(coinType) && !registry.some((r) => r.coinType === coinType)) {
    throw new ValidationError("Unknown asset for this wallet: it is neither held nor a verified asset.");
  }
  const meta = await provider.getCoinMetadata(coinType).catch((err) => {
    throw err instanceof AppError && err.code === "PROVIDER_NOT_FOUND" ? new ValidationError("This asset has no published metadata, so amounts cannot be interpreted.") : err;
  });
  if (meta.decimals === null) throw new ValidationError("This asset does not publish its decimals, so amounts cannot be interpreted.");
  return { history, network, coinType, balances, meta, registry };
}

interface MemoryLoad {
  status: AssessmentInput["memory"]["status"];
  detail: string;
  goals: Awaited<ReturnType<typeof listGoals>>["items"];
  settings: Awaited<ReturnType<typeof loadStrategy>>["settings"];
  feedback: AssessmentInput["memory"]["feedback"];
  pastChecks: AssessmentInput["memory"]["pastChecks"];
  decisions: AssessmentInput["memory"]["decisions"];
  notes: AssessmentInput["memory"]["notes"];
}

async function loadMemory(memory: MemoryService | null, wallet: string, recipient: string | null): Promise<MemoryLoad> {
  const empty = { goals: [], settings: null, feedback: [], pastChecks: [], decisions: [], notes: [] };
  const info = memoryProviderInfo();
  if (info.provider === "disabled") return { status: "not_configured", detail: info.detail, ...empty };
  if (!memory) return { status: "no_session", detail: "No memory session yet; goals, preferences and past decisions are not available.", ...empty };
  try {
    const [goals, strategy, feedback, decisions, reasoning] = await Promise.all([
      listGoals(memory, wallet),
      loadStrategy(memory, wallet),
      listFeedback(memory, wallet),
      listDecisions(memory, wallet),
      memory.list("reasoning", { wallet }),
    ]);
    const pastChecks = reasoning.records.flatMap((r) => {
      if (!r.entityId.startsWith(TRANSFER_CHECK_PREFIX)) return [];
      const d = TransferCheckDataSchema.safeParse(r.data);
      return d.success ? [{ ...d.data, createdAt: r.createdAt }] : [];
    });
    const notes = recipient
      ? (await memory.relevant(`transfer to ${recipient}`, ["reasoning"], { wallet, limit: 4 }))
          .filter((r) => !r.entityId.startsWith(TRANSFER_CHECK_PREFIX))
          .map((r) => ({ summary: r.summary, createdAt: r.createdAt }))
      : [];
    return {
      status: "applied",
      detail: `Loaded from ${info.label}.`,
      goals: goals.items,
      settings: strategy.settings,
      feedback: feedback.items.map((f) => ({ digest: f.digest, verdict: f.verdict, note: f.note, recipients: f.recipients, packages: f.packages, transactionTimeMs: f.transactionTimeMs, memoryId: f.memoryId, createdAt: f.createdAt })),
      pastChecks,
      decisions: decisions.items.map((d) => ({ decision: d.decision, scenario: d.scenario, reason: d.reason, createdAt: d.createdAt })),
      notes,
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("assessment.memory_unavailable", { message: err instanceof Error ? err.message : String(err) });
    return { status: "unavailable", detail: `Memory could not be read: ${err instanceof AppError ? err.message : "unknown error"}`, ...empty };
  }
}

async function priceMap(network: "testnet" | "mainnet", coinTypes: string[], settings: MemoryLoad["settings"]) {
  const priced = await resolvePrices(network, coinTypes, settings?.referencePrices ?? []);
  const prices = new Map<string, EnginePrice>();
  for (const p of priced) {
    if (p.status === "available") prices.set(p.coinType, { priceE8: parseUnits(p.price, USD_DECIMALS), value: p.price, basis: p.basis, asOf: p.asOf });
  }
  return prices;
}

export async function spendableFor(provider: SuiTatumProvider, wallet: string, rawCoinType: string, memory: MemoryService | null): Promise<SpendableBreakdown> {
  const base = await loadBase(provider, wallet, rawCoinType);
  const mem = await loadMemory(memory, wallet, null);
  const prices = await priceMap(base.network, [base.coinType], mem.settings);
  const earmarked = mem.goals.filter((g) => g.coinType === base.coinType).reduce((s, g) => s + g.allocations.reduce((t, a) => t + parseUnits(a.delta, g.decimals), 0n), 0n);
  return computeSpendable({
    coinType: base.coinType,
    symbol: base.meta.symbol,
    decimals: base.meta.decimals!,
    assetClass: classifyAsset(base.network, base.coinType).assetClass,
    balance: base.balances.get(base.coinType) ?? 0n,
    earmarked,
    isSui: base.coinType === SUI_COIN_TYPE,
    gas: estimateGas(base.history.activity),
    settings: mem.settings,
    price: prices.get(base.coinType) ?? null,
  });
}

export async function assessTransferRequest(provider: SuiTatumProvider, wallet: string, req: TransferRequest, memory: MemoryService | null): Promise<TransferAssessment> {
  const recipientParsed = SuiAddressSchema.safeParse(req.recipient);
  if (!recipientParsed.success) throw new ValidationError(`Recipient: ${recipientParsed.error.issues[0]?.message ?? "invalid address"}`);
  const recipient = recipientParsed.data;
  const base = await loadBase(provider, wallet, req.coinType);
  const decimals = base.meta.decimals!;
  let amountRaw: bigint;
  try {
    amountRaw = parseUnits(req.amount, decimals);
  } catch (err) {
    throw new ValidationError(`Amount: ${(err as Error).message}`);
  }
  if (amountRaw <= 0n) throw new ValidationError("Amount must be greater than zero.");

  const [mem, lookup, report] = await Promise.all([
    loadMemory(memory, wallet, recipient),
    lookupRecipient(provider, recipient),
    getSecurityReport(provider, wallet).catch(() => null),
  ]);

  const coinTypes = [...new Set([...base.balances.keys(), base.coinType, ...base.registry.map((r) => r.coinType)])];
  const prices = await priceMap(base.network, coinTypes, mem.settings);
  const metadata = new Map<string, { symbol: string | null; decimals: number | null }>();
  for (const c of [...base.balances.keys()]) {
    try {
      const m = await provider.getCoinMetadata(c);
      metadata.set(c, { symbol: m.symbol, decimals: m.decimals });
    } catch {
      metadata.set(c, { symbol: null, decimals: null });
    }
  }
  const holdings: EngineHolding[] = [...base.balances.entries()].map(([c, bal]) => ({
    coinType: c,
    symbol: metadata.get(c)?.symbol ?? null,
    decimals: metadata.get(c)?.decimals ?? null,
    assetClass: classifyAsset(base.network, c).assetClass,
    rawBalance: bal,
  }));
  const defaultBuyAssets: Partial<Record<AllocationClass, BuyAsset>> = {};
  for (const r of base.registry) if (r.assetClass !== "other" && !defaultBuyAssets[r.assetClass]) defaultBuyAssets[r.assetClass] = { coinType: r.coinType, symbol: r.symbol, decimals: r.decimals };

  const walletCriticals = report
    ? openTransactions(report.assessed)
        .filter((a) => a.assessment.signals.some((s) => s.critical))
        .map((a) => ({ digest: a.digest, title: a.assessment.signals.find((s) => s.critical)!.title }))
    : [];

  const result = assessTransfer({
    wallet,
    recipient,
    asset: { coinType: base.coinType, symbol: base.meta.symbol, decimals, assetClass: classifyAsset(base.network, base.coinType).assetClass },
    amountRaw,
    nowMs: Date.now(),
    asOf: todayUtc(),
    suiCoinType: SUI_COIN_TYPE,
    balances: base.balances,
    holdings,
    history: base.history.activity,
    gas: estimateGas(base.history.activity),
    recipientLookup: lookup,
    lowestAvailableCheckpoint: base.history.chain.lowestAvailableCheckpoint,
    goals: mem.goals,
    settings: mem.settings,
    prices,
    defaultBuyAssets,
    memory: { status: mem.status, detail: mem.detail, feedback: mem.feedback, pastChecks: mem.pastChecks, decisions: mem.decisions, notes: mem.notes },
    walletCriticals,
  });

  return {
    simulationOnly: true,
    wallet,
    recipient,
    asset: { coinType: base.coinType, symbol: base.meta.symbol, decimals },
    amount: req.amount,
    ...result,
    disclaimer: DISCLAIMER,
    gas: estimateGas(base.history.activity),
    generatedAt: new Date().toISOString(),
    source: { provider: "tatum", network: base.network, fetchedAt: base.history.source.fetchedAt },
  };
}
