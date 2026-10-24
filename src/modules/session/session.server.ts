import "server-only";
import { cookies } from "next/headers";
import { ConfigError } from "@/lib/errors";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, encodeSession, newPrincipalId, verifySession } from "./session";

/** Reads (or, if `create`, issues) the signed session principal for this request. */
export async function getPrincipal(opts: { create: boolean }): Promise<string | null> {
  const memory = env().memory;
  if (memory.provider === "disabled") throw new ConfigError(`Memory storage is not configured. ${memory.reason}`, "CONFIG_MISSING");
  const store = await cookies();
  const existing = verifySession(store.get(SESSION_COOKIE)?.value, memory.sessionSecret);
  if (existing || !opts.create) return existing;
  const id = newPrincipalId();
  store.set(SESSION_COOKIE, encodeSession(id, memory.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return id;
}
