import { ValidationError } from "@/lib/errors";
import { formatAmount } from "@/lib/format";
import { handle } from "@/lib/http";
import { SuiAddressSchema, shortAddress } from "@/lib/sui-address";
import { TRANSFER_CHECK_PREFIX } from "@/modules/assessment/transfer.service";
import { DecisionRequestSchema } from "@/modules/assessment/transfer.types";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";
import { normalizeCoinType } from "@/modules/portfolio/assets";

/** Records the user's own decision about a simulated transfer, for recall in later checks. */
export async function POST(req: Request) {
  return handle("POST /api/assessments/transfer/decision", async () => {
    const parsed = DecisionRequestSchema.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid decision.");
    const wallet = walletParam(parsed.data.address);
    const recipient = SuiAddressSchema.safeParse(parsed.data.recipient);
    if (!recipient.success) throw new ValidationError("Invalid recipient address.");
    const service = (await memoryForRequest({ create: true }))!;
    const d = parsed.data;
    const record = await service.write({
      kind: "transfer_decision",
      category: "reasoning",
      source: "user",
      entityId: `${TRANSFER_CHECK_PREFIX}${crypto.randomUUID()}`,
      wallet,
      summary: `User checked a simulated transfer of ${formatAmount(d.amount, 6)} to ${shortAddress(recipient.data)} and said they ${d.decision === "would_proceed" ? "would proceed" : "would not proceed"}${d.note ? `: "${d.note}"` : ""}.`,
      data: { recipient: recipient.data, coinType: normalizeCoinType(d.coinType), amount: d.amount, decision: d.decision, note: d.note || null },
    });
    return { saved: true, memory: { id: record.id, blobId: record.blobId, provider: record.provider } };
  });
}
