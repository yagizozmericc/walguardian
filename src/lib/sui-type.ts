/**
 * Strict validator for canonical Sui (Move) type tags, as produced by
 * normalizeStructTag: full 64-hex addresses, identifier-only module and
 * struct names, and comma-separated type arguments without spaces, e.g.
 *   0x…02::sui::SUI
 *   0x…5d::lp::LP<0x…02::sui::SUI,0x…db::usdc::USDC>
 * The SDK's own parser is lenient (it accepts trailing text), so this is a
 * small recursive-descent parser over the Move type grammar.
 */

const PRIMITIVES = new Set(["bool", "u8", "u16", "u32", "u64", "u128", "u256", "address", "signer"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,127}/;
const ADDRESS = /^0x[0-9a-f]{64}/;

export const MAX_TYPE_TAG_LENGTH = 512;
const MAX_DEPTH = 4;
const MAX_TYPE_ARGS = 8;

/** True only for a canonical struct type tag (the form a coin type takes). */
export function isCanonicalStructTag(input: string): boolean {
  if (input.length === 0 || input.length > MAX_TYPE_TAG_LENGTH) return false;
  const end = parseStruct(input, 0, 0);
  return end === input.length;
}

/** Returns the index after a struct tag starting at `i`, or -1. */
function parseStruct(s: string, i: number, depth: number): number {
  const addr = ADDRESS.exec(s.slice(i));
  if (!addr) return -1;
  i += addr[0].length;
  for (let part = 0; part < 2; part++) {
    if (s.slice(i, i + 2) !== "::") return -1;
    i += 2;
    const id = IDENT.exec(s.slice(i));
    if (!id) return -1;
    i += id[0].length;
  }
  if (s[i] !== "<") return i;
  return parseTypeArgs(s, i, depth + 1);
}

/** Parses "<T1,T2,...>" starting at the "<"; returns the index after ">" or -1. */
function parseTypeArgs(s: string, i: number, depth: number): number {
  if (depth > MAX_DEPTH) return -1;
  i++; // "<"
  for (let n = 1; ; n++) {
    if (n > MAX_TYPE_ARGS) return -1;
    i = parseType(s, i, depth);
    if (i < 0) return -1;
    if (s[i] === ">") return i + 1;
    if (s[i] !== ",") return -1;
    i++;
  }
}

function parseType(s: string, i: number, depth: number): number {
  if (s.startsWith("vector<", i)) {
    if (depth + 1 > MAX_DEPTH) return -1;
    const inner = parseType(s, i + "vector<".length, depth + 1);
    return inner >= 0 && s[inner] === ">" ? inner + 1 : -1;
  }
  const word = /^[a-z0-9]+/.exec(s.slice(i));
  if (word && PRIMITIVES.has(word[0]) && !/[A-Za-z0-9_:]/.test(s[i + word[0].length] ?? "")) return i + word[0].length;
  return parseStruct(s, i, depth);
}
