import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";

const BodySchema = z.object({ address: z.string(), text: z.string().trim().min(3).max(500) });

/** Saves the user's own words as reasoning memory. AI output is never saved as a user fact. */
export async function POST(req: Request) {
  return handle("POST /api/memory/notes", async () => {
    const parsed = BodySchema.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid note.");
    const wallet = walletParam(parsed.data.address);
    const service = (await memoryForRequest({ create: true }))!;
    const record = await service.write({
      kind: "note",
      category: "reasoning",
      source: "user",
      entityId: `note:${crypto.randomUUID()}`,
      wallet,
      summary: `User note: ${parsed.data.text}`,
      data: { text: parsed.data.text },
    });
    return { saved: true, memory: { id: record.id, blobId: record.blobId, provider: record.provider } };
  });
}
