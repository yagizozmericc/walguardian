import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived, HMAC-signed ticket binding a prepared transaction digest to
 * its sender. /execute broadcasts only transactions Guardian itself built and
 * assessed, within the TTL, so the endpoint is not a general relay and the
 * signed bytes are provably the assessed ones. Stateless, so it works across
 * server instances.
 */

export const TICKET_TTL_MS = 10 * 60 * 1000;

function mac(key: string, payload: string): string {
  return createHmac("sha256", key).update(`guardian-tx-ticket:v1|${payload}`).digest("base64url");
}

export function issueTicket(key: string, digest: string, sender: string, nowMs: number): { ticket: string; expiresAtMs: number } {
  const expiresAtMs = nowMs + TICKET_TTL_MS;
  const payload = `${digest}|${sender}|${expiresAtMs}`;
  return { ticket: `${expiresAtMs}.${mac(key, payload)}`, expiresAtMs };
}

export type TicketCheck = { ok: true } | { ok: false; reason: "malformed" | "expired" | "mismatch" };

export function verifyTicket(key: string, ticket: string, digest: string, sender: string, nowMs: number): TicketCheck {
  const m = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!m) return { ok: false, reason: "malformed" };
  const expiresAtMs = Number(m[1]);
  const given = Buffer.from(m[2]!);
  const expected = Buffer.from(mac(key, `${digest}|${sender}|${expiresAtMs}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "mismatch" };
  if (nowMs > expiresAtMs) return { ok: false, reason: "expired" };
  return { ok: true };
}
