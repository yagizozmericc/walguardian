import { ProviderError } from "@/lib/errors";
import type { Kv } from "@/lib/kv";
import { logger } from "@/lib/logger";

/** Admission control for outgoing Tatum requests. */
export interface RequestBudget {
  acquire(): Promise<void>;
}

/**
 * A requests-per-second budget shared by every server instance (one counter
 * per second on the shared store). The per-instance spacer still smooths
 * bursts; this caps the total so several warm instances together stay under
 * the Tatum plan limit. If the store is unavailable the budget is skipped and
 * the per-instance spacer remains the only limit.
 */
export class SharedRequestBudget implements RequestBudget {
  private warned = false;

  constructor(
    private readonly kv: () => Kv,
    private readonly maxPerSecond: number,
    private readonly opts: { maxWaitMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  async acquire(): Promise<void> {
    const { store, shared } = this.kv();
    if (!shared) return;
    const now = this.opts.now ?? Date.now;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deadline = now() + (this.opts.maxWaitMs ?? 8000);
    for (;;) {
      const t = now();
      const second = Math.floor(t / 1000);
      let used: number;
      try {
        [used] = await store.incr([{ key: `tatum:rps:${second}`, ttlS: 5 }]);
      } catch (err) {
        if (!this.warned) logger.warn("kv.tatum_budget_unavailable", { message: err instanceof Error ? err.message : String(err) });
        this.warned = true;
        return;
      }
      this.warned = false;
      if (used <= this.maxPerSecond) return;
      const wait = (second + 1) * 1000 - t + Math.floor(Math.random() * 50);
      if (t + wait > deadline) {
        throw new ProviderError("tatum", "PROVIDER_RATE_LIMITED", "The shared Tatum request budget is busy. Try again in a few seconds.", true);
      }
      await sleep(wait);
    }
  }
}
