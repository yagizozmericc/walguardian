import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { AppError, ValidationError } from "./errors";
import { RateLimiter } from "./rate-limit";

/**
 * Request hygiene shared by API routes: JSON-only bodies with a size cap
 * (a non-JSON content type also blocks simple cross-site form posts), and a
 * per-client budget for endpoints that call Tatum.
 */

export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new ValidationError("Requests must be sent as application/json.");
  const text = await req.text();
  if (text.length > maxBytes) throw new ValidationError("Request body too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be JSON.");
  }
}

const buckets = {
  // Tatum free tier: a few requests per second shared by all users of this server.
  tatum: new RateLimiter(Number(process.env.API_RATE_PER_MINUTE ?? 30), Number(process.env.API_RATE_PER_DAY ?? 2000)),
} as const;

/** Stable, non-reversible client key: the session cookie when present, otherwise the forwarded IP. */
export async function clientKey(): Promise<string> {
  const c = await cookies();
  const h = await headers();
  const raw = c.get("guardian_session")?.value ?? `ip:${h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local"}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function enforceRateLimit(bucket: keyof typeof buckets): Promise<void> {
  const r = buckets[bucket].check(await clientKey());
  if (!r.allowed) throw new AppError("RATE_LIMITED", `Too many requests: ${r.reason}. Try again in ${r.retryAfterS}s.`, 429);
}
