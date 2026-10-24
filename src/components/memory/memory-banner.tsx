import { cn } from "@/lib/utils";
import type { MemoryProviderInfo } from "@/modules/memory/memory.factory";

/** States plainly where memories are kept. Mock storage is never presented as Walrus. */
export function MemoryBanner({
  provider,
  what,
  notices = [],
  className,
}: {
  provider: MemoryProviderInfo | null;
  /** e.g. "Goals", "Preferences and reference prices" */
  what: string;
  notices?: string[];
  className?: string;
}) {
  if (!provider) return null;
  const tone =
    provider.provider === "walrus"
      ? "border-border bg-surface"
      : "border-warning/30 bg-warning-muted";
  const headline =
    provider.provider === "disabled"
      ? `${what} cannot be saved: memory is not configured.`
      : provider.provider === "mock"
        ? `${what} are saved to development mock memory, not Walrus.`
        : `${what} are saved to ${provider.label}.`;
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-[13px]", tone, className)}>
      <span className={cn("font-medium", provider.provider === "walrus" ? "text-foreground" : "text-warning")}>{headline}</span>{" "}
      <span className="text-muted-foreground">{provider.detail}</span>
      {notices.map((n) => (
        <p key={n} className="mt-1 text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  );
}

export function memoryNotices(r: { expired?: number; unreadable?: number; truncated?: boolean }): string[] {
  const out: string[] = [];
  if (r.expired) out.push(`${r.expired} earlier record(s) have expired and can no longer be retrieved.`);
  if (r.unreadable) out.push(`${r.unreadable} record(s) could not be read and were skipped.`);
  if (r.truncated) out.push("More records exist than one retrieval returns; the oldest may be missing.");
  return out;
}
