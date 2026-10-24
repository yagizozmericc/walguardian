import { connection, type NextRequest } from "next/server";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { memoryForRequest, walletParam } from "@/modules/memory/memory.http";
import { MEMORY_CATEGORIES } from "@/modules/memory/memory.types";

/** Memories most relevant to a question (used by assessments and, later, the copilot). */
export async function GET(req: NextRequest) {
  await connection();
  return handle("GET /api/memory/relevant", async () => {
    const wallet = walletParam(req.nextUrl.searchParams.get("address"));
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 300) throw new ValidationError("Query must be 2–300 characters.");
    const service = await memoryForRequest({ create: false });
    if (!service) return { session: false, items: [] };
    const items = await service.relevant(q, MEMORY_CATEGORIES, { wallet, limit: 8 });
    return { session: true, items: items.map((r) => ({ id: r.id, category: r.category, source: r.source, summary: r.summary, createdAt: r.createdAt, data: r.data })) };
  });
}
