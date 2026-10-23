"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWatchAddress } from "@/components/providers/watch-context";
import { SuiAddressSchema, shortAddress } from "@/lib/sui-address";

/** Watch-only address entry. Entering an address never proves ownership. */
export function AddressBar() {
  const { address, setAddress } = useWatchAddress();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (address) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
          title="Watch-only: public onchain data. Ownership is not verified."
        >
          <Eye className="size-3" />
          Watch-only
        </span>
        <span className="truncate font-mono text-[13px]" title={address}>
          {shortAddress(address, 6)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear address"
          onClick={() => setAddress(null)}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex w-full max-w-md items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = SuiAddressSchema.safeParse(draft);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Invalid address.");
          return;
        }
        setError(null);
        setDraft("");
        setAddress(parsed.data);
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Sui address (0x…)"
          aria-label="Sui address"
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          autoComplete="off"
          className="h-8 font-mono text-[13px]"
        />
        {error && <p className="mt-1 text-xs text-critical">{error}</p>}
      </div>
      <Button type="submit" size="default" variant="secondary">
        Analyze
      </Button>
    </form>
  );
}
