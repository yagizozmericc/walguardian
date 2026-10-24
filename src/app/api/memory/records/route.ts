import { connection } from "next/server";
import { handle } from "@/lib/http";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest } from "@/modules/memory/memory.http";

/** All memory records visible to this session, with status, source, timestamp, ids and expiry. */
export async function GET() {
  await connection();
  return handle("GET /api/memory/records", async () => {
    const provider = memoryProviderInfo();
    if (provider.provider === "disabled") return { provider, session: false, entries: [] };
    const service = await memoryForRequest({ create: false });
    if (!service) return { provider, session: false, entries: [] };
    return { provider, session: true, entries: await service.history() };
  });
}
