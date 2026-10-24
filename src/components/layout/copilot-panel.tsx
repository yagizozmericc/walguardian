"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Bookmark, Check, X } from "lucide-react";
import { ErrorState } from "@/components/common/states";
import { useCopilot } from "@/components/copilot/copilot-context";
import { useWatchAddress } from "@/components/providers/watch-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CopilotPoint, CopilotResponse } from "@/modules/ai/ai.types";

const BASIS_LABEL: Record<CopilotPoint["basis"], string> = {
  onchain: "Onchain",
  calculation: "Calculated",
  preference: "Your setting",
  memory: "Memory",
  suggestion: "Suggestion",
  unverified: "Unverified",
};

const SUGGESTIONS = [
  "Why was a transaction flagged?",
  "Is my recent activity unusual for this wallet?",
  "How close am I to my savings goal?",
  "How far is my portfolio from my target allocation?",
  "Why did I reject a similar strategy previously?",
];

function Citation({ c }: { c: CopilotPoint["citations"][number] }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default rounded-sm border border-border px-1 font-mono text-[10px] text-subtle hover:text-foreground">{c.id}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <div className="font-medium">{c.source}</div>
        {c.asOf && <div className="text-muted-foreground">{c.asOf}</div>}
        <div className="mt-1">{c.text}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export function Answer({ r }: { r: CopilotResponse }) {
  const gaps = r.sections.filter((s) => s.status === "unavailable");
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed">{r.answer}</p>
      {r.points.length > 0 && (
        <ul className="space-y-2">
          {r.points.map((p, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-muted-foreground">
              <span className={cn("mr-1.5 text-[10px] font-medium tracking-wide uppercase", p.basis === "unverified" ? "text-warning" : "text-subtle")}>
                {BASIS_LABEL[p.basis]}
              </span>
              {p.text}{" "}
              <span className="inline-flex gap-1 align-middle">
                {p.citations.map((c) => (
                  <Citation key={c.id} c={c} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/30 bg-warning-muted px-2.5 py-2 text-xs text-warning">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.75} />
              {w}
            </li>
          ))}
        </ul>
      )}
      {(r.limitations.length > 0 || gaps.length > 0) && (
        <ul className="space-y-0.5 text-xs text-subtle">
          {r.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {gaps.map((g) => (
            <li key={g.name}>
              {g.name}: unavailable ({g.detail})
            </li>
          ))}
        </ul>
      )}
      <div className="text-[11px] text-subtle">
        {r.mode === "ai" ? `AI-generated with ${r.model} from the cited data. Verify before acting.` : "Deterministic summary — the AI model was not used."}
      </div>
    </div>
  );
}

/** Contextual copilot side panel: answers use cited Tatum data, engine results and memories. */
export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const { address } = useWatchAddress();
  const { messages, pending, ask, remember, clear } = useCopilot();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const submit = () => {
    if (!draft.trim()) return;
    ask(draft);
    setDraft("");
  };

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-border bg-surface lg:w-[400px]" aria-label="Copilot">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="text-[13px] font-medium">Copilot</span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="xs" onClick={clear}>
              Clear
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Close copilot" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {!address ? (
          <p className="text-[13px] text-muted-foreground">Enter a Sui address to ask questions about it.</p>
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Answers use verified onchain data from Tatum, Guardian&apos;s deterministic calculations and your saved memories. Each claim cites its source.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-md border border-border px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-8">
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-[13px]">{m.text}</div>
                <div className="mt-1 flex justify-end">
                  <button
                    onClick={() => remember(m.id)}
                    disabled={m.saved === "saving" || m.saved === "saved"}
                    className="inline-flex items-center gap-1 text-[11px] text-subtle hover:text-foreground disabled:hover:text-subtle"
                    title="Save your own words as a memory the copilot can use later"
                  >
                    {m.saved === "saved" ? <Check className="size-3" /> : <Bookmark className="size-3" />}
                    {m.saved === "saved" ? "Remembered" : m.saved === "saving" ? "Saving…" : m.saved === "error" ? "Could not save — retry" : "Remember this"}
                  </button>
                </div>
              </div>
            ) : m.role === "assistant" ? (
              <div key={m.id}>
                <Answer r={m.response} />
                {m.response.followUps.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.response.followUps.map((f) => (
                      <button key={f} onClick={() => ask(f)} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key={m.id} className="rounded-md border border-border">
                <ErrorState error={m.error} />
              </div>
            ),
          )
        )}
        {pending && <p className="text-xs text-subtle">Gathering data and preparing an answer…</p>}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative">
          <Textarea
            aria-label="Ask the copilot"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={address ? "Ask about this wallet…" : "Enter an address first"}
            disabled={!address}
            rows={2}
            maxLength={500}
            className="resize-none pr-10 text-[13px]"
          />
          <Button type="submit" size="icon-sm" className="absolute right-2 bottom-2" aria-label="Send" disabled={!address || pending || !draft.trim()}>
            <ArrowUp />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">Do not share personal or sensitive information. Questions are sent to Google Gemini (free tier).</p>
      </form>
    </aside>
  );
}
