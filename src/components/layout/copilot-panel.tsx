"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Contextual copilot side panel. The conversational agent is wired in Phase 7;
 * until then the panel states plainly that it is unavailable.
 */
export function CopilotPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside
      className="flex w-full shrink-0 flex-col border-l border-border bg-surface lg:w-[360px]"
      aria-label="Copilot"
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="text-[13px] font-medium">Copilot</span>
        <Button variant="ghost" size="icon-sm" aria-label="Close copilot" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium">Not available yet</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          The copilot answers questions using verified onchain data from Tatum and memories
          retrieved from Walrus. It will be enabled once both integrations are connected.
        </p>
      </div>
    </aside>
  );
}
