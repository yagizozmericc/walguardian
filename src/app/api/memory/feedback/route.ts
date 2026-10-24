import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";
import { saveFeedback } from "@/modules/memory/memory.repositories";
import { nonFrameworkPackages } from "@/modules/security/baseline.service";
import { getSecurityReport } from "@/modules/security/security.service";

const BodySchema = z.object({
  address: z.string(),
  digest: z.string().min(20).max(64),
  verdict: z.enum(["expected", "suspicious", "unsure"]),
  note: z.string().trim().max(500).nullable(),
});

export async function POST(req: Request) {
  return handle("POST /api/memory/feedback", async () => {
    const parsed = BodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid feedback.");
    const wallet = walletParam(parsed.data.address);
    // Context comes from our own assessment of the transaction, never from the client.
    const report = await getSecurityReport(getSuiProvider(), wallet);
    const assessed = report.assessed.find((a) => a.digest === parsed.data.digest);
    if (!assessed) throw new ValidationError("That transaction is not among this wallet's assessed transactions.");
    const service = (await memoryForRequest({ create: true }))!;
    const record = await saveFeedback(service, wallet, {
      digest: assessed.digest,
      verdict: parsed.data.verdict,
      note: parsed.data.note || null,
      recipients: assessed.recipients,
      packages: nonFrameworkPackages(assessed),
      transactionTimeMs: assessed.timestampMs,
      score: assessed.assessment.score,
      critical: assessed.assessment.signals.some((s) => s.critical),
    });
    return { saved: true, memory: { id: record.id, blobId: record.blobId, provider: record.provider } };
  });
}
