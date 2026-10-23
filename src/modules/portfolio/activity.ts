import type { CoinMetadata, NormalizedTransaction } from "@/modules/blockchain/blockchain.types";
import { formatUnits } from "@/lib/units";
import { SUI_COIN_TYPE } from "./assets";
import type { ActivityDirection, ActivityItem, ActivityTransfer } from "./portfolio.types";

/**
 * Derives the watched address's view of a transaction from its balance
 * changes. Deterministic and side-effect free.
 */
export function deriveActivity(
  tx: NormalizedTransaction,
  watched: string,
  metadata: ReadonlyMap<string, CoinMetadata>,
): ActivityItem {
  const isSender = tx.sender === watched;

  const net = new Map<string, bigint>();
  for (const c of tx.balanceChanges) {
    if (c.address !== watched) continue;
    net.set(c.coinType, (net.get(c.coinType) ?? 0n) + BigInt(c.amount));
  }

  const transfers: ActivityTransfer[] = [];
  for (const [coinType, value] of net) {
    let amount = value;
    let gasExcluded = false;
    // The sender's SUI change includes the gas fee; remove it to isolate transferred value.
    if (isSender && coinType === SUI_COIN_TYPE && tx.gasFeeMist !== null) {
      amount = value + BigInt(tx.gasFeeMist);
      gasExcluded = true;
    }
    if (amount === 0n) continue;
    const meta = metadata.get(coinType);
    const decimals = meta?.decimals ?? null;
    transfers.push({
      coinType,
      symbol: meta?.symbol ?? null,
      decimals,
      rawAmount: amount.toString(),
      amount: decimals === null ? null : formatUnits(amount, decimals),
      gasExcluded,
    });
  }

  const hasOut = transfers.some((t) => BigInt(t.rawAmount) < 0n);
  const hasIn = transfers.some((t) => BigInt(t.rawAmount) > 0n);
  const direction: ActivityDirection = hasOut && hasIn ? "swap" : hasOut ? "out" : hasIn ? "in" : "none";

  const outCoins = new Set(transfers.filter((t) => BigInt(t.rawAmount) < 0n).map((t) => t.coinType));
  const inCoins = new Set(transfers.filter((t) => BigInt(t.rawAmount) > 0n).map((t) => t.coinType));
  const counterparties = new Set<string>();
  const recipients = new Set<string>();
  for (const c of tx.balanceChanges) {
    if (c.address === watched) continue;
    const v = BigInt(c.amount);
    if (outCoins.has(c.coinType) && v > 0n) {
      counterparties.add(c.address);
      recipients.add(c.address);
    }
    if (inCoins.has(c.coinType) && v < 0n) counterparties.add(c.address);
  }
  if (!isSender && hasIn && tx.sender) counterparties.add(tx.sender);

  return {
    digest: tx.digest,
    timestampMs: tx.timestampMs,
    checkpoint: tx.checkpoint,
    success: tx.success,
    kind: tx.kind,
    isSender,
    sender: tx.sender,
    direction,
    transfers,
    counterparties: [...counterparties],
    recipients: [...recipients],
    gasFeeMist: tx.gasFeeMist,
    moveCalls: tx.moveCalls,
  };
}
