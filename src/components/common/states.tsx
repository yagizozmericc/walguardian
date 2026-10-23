import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-1.5 px-4 py-10 md:px-6", className)}>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-lg text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface DisplayError {
  code?: string;
  message: string;
  provider?: string;
  requestId?: string;
}

const PROVIDER_LABEL: Record<string, string> = { tatum: "Tatum", walrus: "Walrus Memory", llm: "AI model" };

/** An explicit integration or request error. Never replaced with placeholder data. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: DisplayError;
  onRetry?: () => void;
  className?: string;
}) {
  const source = error.provider ? PROVIDER_LABEL[error.provider] ?? error.provider : null;
  return (
    <div className={cn("flex items-start gap-3 px-4 py-6 md:px-6", className)} role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" strokeWidth={1.75} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">
          {source ? `${source} request failed` : "Request failed"}
        </p>
        <p className="text-[13px] text-muted-foreground">{error.message}</p>
        <p className="font-mono text-[11px] text-subtle">
          {[error.code, error.requestId && `request ${error.requestId}`].filter(Boolean).join(" · ")}
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-40" : "w-20", c > 0 && "ml-auto")} />
          ))}
        </div>
      ))}
    </div>
  );
}
