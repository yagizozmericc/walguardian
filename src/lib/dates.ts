/** Calendar-date helpers on ISO "YYYY-MM-DD" strings, always in UTC. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isoDateToMs(value: string): number {
  if (!isIsoDate(value)) throw new RangeError(`Not an ISO date: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function msToIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((isoDateToMs(to) - isoDateToMs(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return msToIsoDate(isoDateToMs(date) + days * DAY_MS);
}

export function todayUtc(now = Date.now()): string {
  return msToIsoDate(now);
}
