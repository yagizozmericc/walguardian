import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { listFeedback } from "@/modules/memory/memory.repositories";
import type { MemoryService } from "@/modules/memory/memory.service";
import type { FeedbackKnowledge, SecurityReport } from "./security.types";

/** Loads the user's Protect reviews from memory. Failure is reported in the result, never hidden. */
export async function loadReviewKnowledge(
  getService: () => Promise<MemoryService | null>,
  address: string,
): Promise<{ memory: SecurityReport["memory"]; feedback: FeedbackKnowledge[] }> {
  const info = memoryProviderInfo();
  if (info.provider === "disabled") {
    return { memory: { status: "not_configured", provider: null, feedbackCount: 0, detail: info.detail }, feedback: [] };
  }
  try {
    const service = await getService();
    if (!service) {
      return { memory: { status: "no_session", provider: info.provider, feedbackCount: 0, detail: "No memory session yet; reviews you save will be applied." }, feedback: [] };
    }
    const loaded = await listFeedback(service, address);
    const feedback = loaded.items.map((f) => ({
      digest: f.digest, verdict: f.verdict, note: f.note, recipients: f.recipients, packages: f.packages,
      transactionTimeMs: f.transactionTimeMs, memoryId: f.memoryId, createdAt: f.createdAt,
    }));
    const extras = [loaded.expired && `${loaded.expired} expired`, loaded.unreadable && `${loaded.unreadable} unreadable`].filter(Boolean).join(", ");
    return {
      memory: { status: "applied", provider: info.provider, feedbackCount: feedback.length, detail: `${feedback.length} review(s) loaded from ${info.label}${extras ? ` (${extras})` : ""}.` },
      feedback,
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("security.memory_unavailable", { message: err instanceof Error ? err.message : String(err) });
    return {
      memory: { status: "unavailable", provider: info.provider, feedbackCount: 0, detail: `Memory could not be read, so your reviews were not applied: ${err instanceof AppError ? err.message : "unknown error"}` },
      feedback: [],
    };
  }
}
