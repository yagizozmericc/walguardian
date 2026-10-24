import type { NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AppError, ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { logger } from "@/lib/logger";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest } from "@/modules/memory/memory.http";
import { listFeedback } from "@/modules/memory/memory.repositories";
import { getSecurityReport } from "@/modules/security/security.service";
import type { FeedbackKnowledge, SecurityReport } from "@/modules/security/security.types";

/** Loads the user's reviews from memory. Failure is reported in the result, never hidden. */
async function loadKnowledge(address: string): Promise<{ memory: SecurityReport["memory"]; feedback: FeedbackKnowledge[] }> {
  const info = memoryProviderInfo();
  if (info.provider === "disabled") {
    return { memory: { status: "not_configured", provider: null, feedbackCount: 0, detail: info.detail }, feedback: [] };
  }
  try {
    const service = await memoryForRequest({ create: false });
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

export async function GET(req: NextRequest, ctx: RouteContext<"/api/security/[address]">) {
  return handle("GET /api/security/[address]", async () => {
    const { address: raw } = await ctx.params;
    const address = SuiAddressSchema.safeParse(raw);
    if (!address.success) throw new ValidationError(address.error.issues[0]?.message ?? "Invalid address.");
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const { memory, feedback } = await loadKnowledge(address.data);
    return getSecurityReport(getSuiProvider(), address.data, { fresh, memory, feedback });
  });
}
