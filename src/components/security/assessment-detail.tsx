"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimestamp, suiscanTxUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssessedTransaction, Evidence } from "@/modules/security/security.types";
import { CONFIDENCE_LABEL, SEVERITY_LABEL, SEVERITY_TEXT } from "./labels";

function EvidenceRow({ e, network }: { e: Evidence; network: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1 text-xs">
      <dt className="text-subtle">{e.label}</dt>
      <dd className="min-w-0">
        <span className="num break-all text-muted-foreground">{e.value}</span>
        {e.digests && e.digests.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {e.digests.slice(0, 12).map((d) => (
              <a
                key={d}
                href={suiscanTxUrl(network, d)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-subtle underline-offset-4 hover:text-foreground hover:underline"
              >
                {d.slice(0, 8)}…
              </a>
            ))}
            {e.digests.length > 12 && <span className="text-[11px] text-subtle">+{e.digests.length - 12}</span>}
          </div>
        )}
      </dd>
    </div>
  );
}

export function AssessmentDetail({ item, network }: { item: AssessedTransaction; network: string }) {
  const a = item.assessment;
  return (
    <div className="divide-y divide-border">
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={suiscanTxUrl(network, item.digest)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
              title={item.digest}
            >
              <span className="truncate">{item.digest}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <div className="num mt-0.5 text-xs text-subtle">{formatTimestamp(item.timestampMs)}</div>
          </div>
          <div className="text-right">
            <div className="num text-[28px] leading-none font-medium tracking-tight">{a.score}</div>
            <div className={cn("mt-1 text-xs", SEVERITY_TEXT[a.severity])}>{SEVERITY_LABEL[a.severity]} severity</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="label-caps">Confidence</dt>
            <dd className="mt-1">{CONFIDENCE_LABEL[a.confidence]}</dd>
          </div>
          <div>
            <dt className="label-caps">Baseline</dt>
            <dd className="mt-1">{a.baselineSize} prior sent transactions</dd>
          </div>
        </dl>
      </div>

      <section className="px-4 py-4">
        <h3 className="label-caps">Score breakdown</h3>
        {a.signals.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No rule contributed points to this transaction.</p>
        ) : (
          <ol className="mt-3 space-y-4">
            {a.signals.map((s) => (
              <li key={s.rule}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">
                    {s.title}
                    {s.critical && (
                      <span className="ml-2 rounded-sm border border-critical/40 px-1 py-px text-[10px] font-medium tracking-wide text-critical uppercase">
                        Critical
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-[13px] text-muted-foreground">+{s.points}</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{s.explanation}</p>
                <dl className="mt-2 border-l border-border pl-3">
                  {s.evidence.map((e) => (
                    <EvidenceRow key={e.label} e={e} network={network} />
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
        {a.signals.length > 1 && (
          <p className="num mt-4 text-xs text-subtle">
            Sum {a.signals.reduce((s, x) => s + x.points, 0)} points{a.score === 100 ? ", capped at 100" : ""}.
          </p>
        )}
      </section>

      {(a.notes.length > 0 || a.limitations.length > 0) && (
        <section className="space-y-2 px-4 py-4">
          <h3 className="label-caps">Not scored</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {a.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {a.limitations.map((l, i) => (
              <li key={`${l.rule}-${i}`}>
                <span className="text-subtle">Not evaluated · </span>
                {l.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 px-4 py-4">
        <h3 className="label-caps">Your assessment</h3>
        <div className="flex flex-wrap gap-2">
          {["Expected activity", "Suspicious", "Not sure"].map((label) => (
            <Button key={label} variant="outline" size="sm" disabled>
              {label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-subtle">
          Feedback is stored in Walrus Memory and used in later assessments. It is disabled until the Walrus Memory
          integration is connected.
        </p>
      </section>
    </div>
  );
}
