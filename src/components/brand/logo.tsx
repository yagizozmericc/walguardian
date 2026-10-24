import { cn } from "@/lib/utils";

export const BRAND_NAME = "Walguardian";
export const BRAND_TAGLINE = "Your Money. A Smarter Memory.";

/** The Walguardian shield. Inherits `currentColor`; size it with `className`. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} aria-hidden>
      <path
        d="M8 1.5 2.5 3.75v4.1c0 3.1 2.3 5.6 5.5 6.65 3.2-1.05 5.5-3.55 5.5-6.65v-4.1L8 1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
