/** In-process sliding-window limiter (per key). Single-instance by design; see docs/DEPLOYMENT.md. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly perMinute: number,
    private readonly perDay: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: true } | { allowed: false; reason: string; retryAfterS: number } {
    const day = 86_400_000;
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < day);
    const lastMinute = list.filter((t) => now - t < 60_000);
    if (lastMinute.length >= this.perMinute) {
      return { allowed: false, reason: `limit of ${this.perMinute} requests per minute reached`, retryAfterS: Math.ceil((60_000 - (now - lastMinute[0])) / 1000) };
    }
    if (list.length >= this.perDay) {
      return { allowed: false, reason: `daily limit of ${this.perDay} requests reached`, retryAfterS: Math.ceil((day - (now - list[0])) / 1000) };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return { allowed: true };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= 86_400_000)) this.hits.delete(k);
  }
}
