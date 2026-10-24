import { cn } from "@/lib/utils";

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Section({
  id,
  children,
  className,
  labelledBy,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("mk-section relative py-24 sm:py-32", className)}>
      {children}
    </section>
  );
}

/** Small mono label above a section heading. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2.5 font-mono text-[11px] font-medium tracking-[0.16em] text-brand uppercase", className)}>
      <span className="h-px w-5 bg-brand/60" aria-hidden />
      {children}
    </p>
  );
}

export function Heading({
  id,
  children,
  className,
  as: Tag = "h2",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag id={id} className={cn("mk-heading text-balance text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] font-semibold tracking-[-0.035em]", className)}>
      {children}
    </Tag>
  );
}

export function Lede({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground", className)}>{children}</p>;
}

/**
 * Browser-style frame around a static product preview. Every preview is
 * labelled illustrative so no figure reads as real data.
 */
export function ProductFrame({
  title,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <figure className={cn("mk-frame overflow-hidden rounded-xl border border-border bg-background", className)}>
      <div className="flex h-9 items-center gap-3 border-b border-border bg-surface/60 px-3.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
        </span>
        <figcaption className="min-w-0 flex-1 truncate text-center text-[11px] text-subtle">{title}</figcaption>
        <span className="rounded-sm border border-border px-1.5 py-px font-mono text-[9.5px] tracking-wide text-subtle uppercase">Illustrative</span>
      </div>
      <div className={bodyClassName}>{children}</div>
    </figure>
  );
}

/** Compact panel mirroring the app's `Panel` component. */
export function MiniPanel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface", className)}>
      <div className="flex min-h-9 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-border px-3.5 py-2">
        <span className="text-[12px] font-medium">{title}</span>
        {meta && <span className="truncate text-[10.5px] text-subtle">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} aria-hidden />;
}
