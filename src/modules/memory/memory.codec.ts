import { ValidationError } from "@/lib/errors";
import { EnvelopeSchema, type Envelope } from "./memory.types";

/**
 * Text format stored in Walrus Memory:
 *
 *   <one-line human summary>
 *   <<guardian:{"v":1,...}>>
 *
 * The summary embeds well for semantic recall; the envelope carries the
 * structured, validated fields. Recalled text is untrusted data: it is parsed
 * and validated, never interpreted as instructions.
 */

const PREFIX = "<<guardian:";
const SUFFIX = ">>";
export const MAX_RECORD_CHARS = 16_000;

/** Content that must never be persisted (memories are readable by the relayer). */
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /suiprivkey1[0-9a-z]{20,}/i, label: "a Sui private key" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "a PEM private key" },
  { pattern: /\b(seed phrase|mnemonic|recovery phrase|private key|secret key)\b/i, label: "key or seed-phrase material" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, label: "a bearer token" },
];

export function assertSafeToStore(text: string): void {
  for (const f of FORBIDDEN) {
    if (f.pattern.test(text)) throw new ValidationError(`Refusing to store memory that appears to contain ${f.label}.`);
  }
}

export function encodeMemory(summary: string, envelope: Envelope): string {
  // The summary is a single line and can never contain the envelope marker.
  const oneLine = summary.replace(/\s+/g, " ").replaceAll(PREFIX, "").trim().slice(0, 300);
  const text = `${oneLine}\n${PREFIX}${JSON.stringify(envelope)}${SUFFIX}`;
  if (text.length > MAX_RECORD_CHARS) throw new ValidationError("Memory record is too large.");
  assertSafeToStore(text);
  return text;
}

export function decodeMemory(text: string): { summary: string; envelope: Envelope } | null {
  if (text.length > MAX_RECORD_CHARS) return null;
  // The envelope is always the last line; anything earlier is the summary.
  const trimmed = text.trimEnd();
  const cut = trimmed.lastIndexOf("\n");
  const last = trimmed.slice(cut + 1);
  if (!last.startsWith(PREFIX) || !last.endsWith(SUFFIX)) return null;
  let json: unknown;
  try {
    json = JSON.parse(last.slice(PREFIX.length, -SUFFIX.length));
  } catch {
    return null;
  }
  const parsed = EnvelopeSchema.safeParse(json);
  if (!parsed.success) return null;
  return { summary: cut === -1 ? "" : trimmed.slice(0, cut).trim(), envelope: parsed.data };
}
