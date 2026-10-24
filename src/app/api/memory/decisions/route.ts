import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";
import { DecisionSchema, listDecisions, saveDecision } from "@/modules/memory/memory.repositories";

export async function GET(req: NextRequest) {
  await connection();
  return handle("GET /api/memory/decisions", async () => {
    const wallet = walletParam(req.nextUrl.searchParams.get("address"));
    if (memoryProviderInfo().provider === "disabled") return { session: false, items: [], expired: 0, unreadable: 0, truncated: false };
    const service = await memoryForRequest({ create: false });
    if (!service) return { session: false, items: [], expired: 0, unreadable: 0, truncated: false };
    return { session: true, ...(await listDecisions(service, wallet)) };
  });
}

const BodySchema = z.object({ address: z.string(), decision: DecisionSchema });

export async function POST(req: Request) {
  return handle("POST /api/memory/decisions", async () => {
    const parsed = BodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid decision.");
    const wallet = walletParam(parsed.data.address);
    const service = (await memoryForRequest({ create: true }))!;
    const record = await saveDecision(service, wallet, parsed.data.decision);
    return { saved: true, memory: { id: record.id, blobId: record.blobId, provider: record.provider } };
  });
}
