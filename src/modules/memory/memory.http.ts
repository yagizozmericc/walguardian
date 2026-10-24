import "server-only";
import { ValidationError } from "@/lib/errors";
import { readJsonBody } from "@/lib/request-guard";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getPrincipal } from "@/modules/session/session.server";
import { getMemoryService } from "./memory.factory";
import type { MemoryService } from "./memory.service";

/** Resolves the session principal (issuing one if allowed) and its memory service. */
export async function memoryForRequest(opts: { create: boolean }): Promise<MemoryService | null> {
  const principal = await getPrincipal(opts);
  return principal ? getMemoryService(principal) : null;
}

export function walletParam(value: string | null): string {
  const parsed = SuiAddressSchema.safeParse(value ?? "");
  if (!parsed.success) throw new ValidationError("A valid Sui address is required.");
  return parsed.data;
}

/** JSON-only, size-capped body reader (see lib/request-guard). */
export function readJson(req: Request, maxBytes = 128 * 1024): Promise<unknown> {
  return readJsonBody(req, maxBytes);
}
