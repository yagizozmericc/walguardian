import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Anonymous, signed browser sessions. The principal is a random id, never a
 * wallet address, so knowing an address grants no access to its memories.
 * The cookie is httpOnly and HMAC-signed with SESSION_SECRET.
 */

export const SESSION_COOKIE = "guardian_session";
export const SESSION_MAX_AGE_S = 180 * 24 * 3600;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sign(id: string, secret: string): string {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(`guardian-session:${id}`).digest("base64url");
}

export function newPrincipalId(): string {
  return randomUUID();
}

export function encodeSession(id: string, secret: string): string {
  return `${id}.${sign(id, secret)}`;
}

/** Returns the principal id for a valid cookie value, otherwise null. */
export function verifySession(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  if (!ID.test(id)) return null;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(id, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** Short, non-reversible tag stored in each memory envelope as a second isolation check. */
export function principalTag(id: string): string {
  return createHash("sha256").update(`guardian-principal:${id}`).digest("hex").slice(0, 16);
}
