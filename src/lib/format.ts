/**
 * Display formatting for exact decimal strings. Operates on strings so large
 * balances never lose precision; truncates (never rounds up) fractional digits.
 */
export function formatAmount(decimal: string, maxFraction = 4): string {
  const negative = decimal.startsWith("-");
  const [intPart, frac = ""] = (negative ? decimal.slice(1) : decimal).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const shown = frac.slice(0, maxFraction).replace(/0+$/, "");
  const tiny = intPart === "0" && shown === "" && /[1-9]/.test(frac);
  if (tiny) return `${negative ? "-" : ""}<0.${"0".repeat(Math.max(maxFraction - 1, 0))}1`;
  return `${negative ? "-" : ""}${grouped}${shown ? `.${shown}` : ""}`;
}

export function formatSigned(decimal: string, maxFraction = 4): string {
  return decimal.startsWith("-") ? `−${formatAmount(decimal.slice(1), maxFraction)}` : `+${formatAmount(decimal, maxFraction)}`;
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTimestamp(ms: number | null): string {
  return ms === null ? "—" : dateTime.format(new Date(ms));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** "0x…::module::Name" → "module::Name" for compact display. */
export function shortCoinType(coinType: string): string {
  const parts = coinType.split("::");
  return parts.length >= 3 ? parts.slice(1).join("::") : coinType;
}

export function suiscanTxUrl(network: string, digest: string): string {
  return `https://suiscan.xyz/${network}/tx/${encodeURIComponent(digest)}`;
}

export function suiscanAccountUrl(network: string, address: string): string {
  return `https://suiscan.xyz/${network}/account/${encodeURIComponent(address)}`;
}
