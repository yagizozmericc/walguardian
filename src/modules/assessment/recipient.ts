import "server-only";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import type { RecipientLookup } from "./transfer.types";

/**
 * One read-only Tatum lookup of the recipient's recent activity. Cached,
 * time-boxed and rate-limited by the shared client; it never throws, so an
 * unavailable lookup cannot stop the rest of the assessment.
 */

const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 6_000;
const SAMPLE = 5;
const cache = new Map<string, { at: number; value: RecipientLookup }>();

export async function lookupRecipient(provider: SuiTatumProvider, recipient: string, now = Date.now()): Promise<RecipientLookup> {
  const hit = cache.get(recipient);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  let value: RecipientLookup;
  try {
    const page = await Promise.race([
      provider.getTransactions(recipient, { limit: SAMPLE }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    value =
      page.transactions.length === 0
        ? { status: "no_activity" }
        : {
            status: "active",
            recentTransactions: page.transactions.length,
            atLeast: page.transactions.length >= SAMPLE && page.nextCursor !== null,
            lastActivityMs: page.transactions[0].timestampMs,
          };
  } catch (err) {
    const reason = err instanceof AppError ? err.message : err instanceof Error && err.message === "timeout" ? "the lookup timed out" : "the lookup failed";
    logger.warn("assessment.recipient_lookup_unavailable", { reason });
    // Failures are not cached for long, so a later attempt can succeed.
    value = { status: "unavailable", reason };
    cache.set(recipient, { at: now - TTL_MS + 30_000, value });
    return value;
  }
  cache.set(recipient, { at: now, value });
  return value;
}
