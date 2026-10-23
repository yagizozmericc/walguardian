/**
 * Exact integer-unit arithmetic for token amounts. Raw onchain amounts are
 * integers in the coin's smallest unit; we never route them through floats.
 */

export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError(`Unsafe integer: ${value}`);
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) throw new RangeError(`Not an integer string: ${value}`);
  return BigInt(value);
}

/** Formats a raw integer amount as an exact decimal string, e.g. (1500000000n, 9) → "1.5". */
export function formatUnits(raw: string | bigint, decimals: number): string {
  const v = toBigInt(raw);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  if (decimals === 0) return `${negative ? "-" : ""}${abs}`;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export function absBigInt(v: bigint): bigint {
  return v < 0n ? -v : v;
}
