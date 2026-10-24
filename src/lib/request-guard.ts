import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/modules/session/session";
import { env } from "./env";
import { AppError, ValidationError } from "./errors";
import { getKv, localKv } from "./kv";
import { logger } from "./logger";
import { consumeLimits, type LimitResult, type LimitRule } from "./rate-limit";

/**
 * Request hygiene shared by API routes: JSON-only bodies with a size cap
 * (a non-JSON content type also blocks simple cross-site form posts), and
 * per-client budgets enforced on the shared store.
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

/** Several people can share one address (NAT, venue Wi-Fi), so IP budgets are wider than session budgets. */
const IP_MULTIPLIER = 5;
/** During a Redis outage, read budgets fall back to each instance with a third of the normal allowance. */
const DEGRADED_DIVISOR = 3;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex").slice(0, 24);

/**
 * Budgets for this client: its verified session (when memory is enabled) and
 * its IP. An unverifiable cookie is ignored, so forged cookie values cannot
 * mint fresh budgets; dropping the cookie still leaves the IP budget.
 */
export async function clientRules(perMinute: number, perDay: number): Promise<LimitRule[]> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const rules: LimitRule[] = [{ id: `ip:${hash(ip)}`, perMinute: perMinute * IP_MULTIPLIER, perDay: perDay * IP_MULTIPLIER }];
  const memory = env().memory;
  if (memory.provider !== "disabled") {
    const principal = verifySession((await cookies()).get(SESSION_COOKIE)?.value, memory.sessionSecret);
    if (principal) rules.unshift({ id: `s:${hash(principal)}`, perMinute, perDay });
  }
  return rules;
}

export type GuardResult = LimitResult | { allowed: false; unavailable: true; reason: string; retryAfterS: number };

/**
 * Consumes budgets on the shared store. If Redis fails, `degrade` falls back
 * to a stricter per-instance budget (bounded cost, app stays usable) and
 * `deny` refuses (for paid calls and writes, where an unenforced budget is
 * not acceptable).
 */
export async function limit(bucket: string, rules: readonly LimitRule[], onOutage: "degrade" | "deny"): Promise<GuardResult> {
  const { store, shared } = getKv();
  try {
    return await consumeLimits(store, bucket, rules);
  } catch (err) {
    if (!shared) throw err;
    logger.warn("kv.limit_unavailable", { bucket, onOutage, message: err instanceof Error ? err.message : String(err) });
    if (onOutage === "deny") return { allowed: false, unavailable: true, reason: "the shared rate limiter is temporarily unavailable", retryAfterS: 30 };
    const strict = rules.map((r) => ({ ...r, perMinute: Math.max(1, Math.floor(r.perMinute / DEGRADED_DIVISOR)), perDay: Math.max(1, Math.floor(r.perDay / DEGRADED_DIVISOR)) }));
    return consumeLimits(localKv(), bucket, strict);
  }
}

/** Budget for routes that call Tatum. */
export async function enforceRateLimit(bucket: "tatum"): Promise<void> {
  const { apiPerMinute, apiPerDay } = env().limits;
  const r = await limit(bucket, await clientRules(apiPerMinute, apiPerDay), "degrade");
  if (!r.allowed) throw new AppError("RATE_LIMITED", `Too many requests: ${r.reason}. Try again in ${r.retryAfterS}s.`, 429);
}
