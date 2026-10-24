"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { fetchJson, toDisplayError } from "@/components/common/use-api-resource";
import type { DisplayError } from "@/components/common/states";
import { useWatchAddress } from "@/components/providers/watch-context";
import type { CopilotResponse } from "@/modules/ai/ai.types";

export type CopilotMessage =
  | { id: string; role: "user"; text: string; saved?: "saving" | "saved" | "error" }
  | { id: string; role: "assistant"; response: CopilotResponse }
  | { id: string; role: "error"; error: DisplayError };

interface CopilotState {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: CopilotMessage[];
  pending: boolean;
  ask: (question: string) => void;
  remember: (messageId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CopilotState | null>(null);
const JSON_HEADERS = { "content-type": "application/json" };

/** Conversation state for the side panel. Kept in this tab only; memory is saved explicitly. */
export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWatchAddress();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [pending, setPending] = useState(false);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || !address || pending) return;
      setOpen(true);
      const history: { role: "user" | "assistant"; text: string }[] = [];
      for (const m of messages) {
        if (m.role === "user") history.push({ role: "user", text: m.text });
        else if (m.role === "assistant") history.push({ role: "assistant", text: m.response.answer });
      }
      setMessages((ms) => [...ms, { id: crypto.randomUUID(), role: "user", text: q }]);
      setPending(true);
      fetchJson<CopilotResponse>("/api/copilot", undefined, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ address, question: q, history: history.slice(-6) }) })
        .then((response) => setMessages((ms) => [...ms, { id: crypto.randomUUID(), role: "assistant", response }]))
        .catch((err) => setMessages((ms) => [...ms, { id: crypto.randomUUID(), role: "error", error: toDisplayError(err) }]))
        .finally(() => setPending(false));
    },
    [address, pending, messages],
  );

  const remember = useCallback(
    (messageId: string) => {
      const m = messages.find((x) => x.id === messageId);
      if (!m || m.role !== "user" || !address) return;
      const mark = (saved: "saving" | "saved" | "error") => setMessages((ms) => ms.map((x) => (x.id === messageId && x.role === "user" ? { ...x, saved } : x)));
      mark("saving");
      fetchJson("/api/memory/notes", undefined, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ address, text: m.text }) })
        .then(() => mark("saved"))
        .catch(() => mark("error"));
    },
    [address, messages],
  );

  return (
    <Ctx.Provider value={{ open, setOpen, messages, pending, ask, remember, clear: () => setMessages([]) }}>{children}</Ctx.Provider>
  );
}

export function useCopilot(): CopilotState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCopilot must be used inside <CopilotProvider>.");
  return ctx;
}
