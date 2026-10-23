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

const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Parses an exact decimal string into integer smallest units, e.g. ("1.5", 9) → 1500000000n.
 * Rejects more fractional digits than the coin supports instead of rounding.
 */
export function parseUnits(value: string, decimals: number): bigint {
  const v = value.trim();
  if (!DECIMAL.test(v)) throw new RangeError(`Not a decimal amount: ${value}`);
  const negative = v.startsWith("-");
  const [whole, frac = ""] = (negative ? v.slice(1) : v).split(".");
  if (frac.length > decimals) throw new RangeError(`At most ${decimals} decimal places are allowed.`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return negative ? -raw : raw;
}

/** Integer division rounding toward +infinity (for amounts that must be sufficient). */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError("Divisor must be positive.");
  if (a <= 0n) return -((-a) / b);
  return (a + b - 1n) / b;
}
