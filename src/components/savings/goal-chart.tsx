"use client";

import { useEffect, useRef, useState } from "react";
import { DAY_MS, isoDateToMs, msToIsoDate } from "@/lib/dates";
import { formatAmount } from "@/lib/format";
import type { GoalEvaluation, SavingsGoal } from "@/modules/savings/savings.types";

const H = 200;
const PAD = { top: 22, right: 16, bottom: 26, left: 56 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** Earmarked funds over time against the straight-line plan (plotting only; figures come from exact strings). */
export function GoalChart({ goal, evaluation }: { goal: SavingsGoal; evaluation: GoalEvaluation }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const startMs = isoDateToMs(goal.startDate);
  const asOfMs = isoDateToMs(evaluation.asOf);
  const lastEventMs = evaluation.history.length ? isoDateToMs(evaluation.history.at(-1)!.date) : startMs;
  const endMs = goal.targetDate
    ? Math.max(isoDateToMs(goal.targetDate), asOfMs)
    : Math.max(asOfMs, lastEventMs) + 30 * DAY_MS;
  const target = Number(evaluation.target);
  const maxEarmarked = Math.max(0, ...evaluation.history.map((h) => Number(h.earmarked)));
  const yMax = niceMax(Math.max(target, maxEarmarked) * 1.05);
  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (ms: number) => PAD.left + ((ms - startMs) / Math.max(endMs - startMs, DAY_MS)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  // Step line: value holds until the next allocation event, through today.
  const steps: [number, number][] = [[startMs, 0]];
  for (const h of evaluation.history) {
    const ms = isoDateToMs(h.date);
    steps.push([ms, steps.at(-1)![1]], [ms, Number(h.earmarked)]);
  }
  steps.push([asOfMs, steps.at(-1)![1]]);
  const stepPath = steps.map(([ms, v], i) => `${i ? "L" : "M"}${x(ms).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const plan = goal.kind === "target" && goal.targetDate;
  const planEndMs = plan ? isoDateToMs(goal.targetDate!) : null;

  const earmarkedAt = (ms: number) => {
    let v = "0";
    for (const h of evaluation.history) if (isoDateToMs(h.date) <= ms) v = h.earmarked;
    return v;
  };
  const planAt = (ms: number) => (planEndMs ? (target * Math.min(Math.max((ms - startMs) / (planEndMs - startMs), 0), 1)) : null);

  const ticks = [0, yMax / 2, yMax];
  const unit = goal.symbol ?? "";
  const hoverMs = hover === null ? null : Math.min(Math.max(hover, startMs), Math.min(endMs, asOfMs));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 px-4 pt-3 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-chart-1" /> Earmarked
        </span>
        {plan && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-chart-4" /> Straight-line plan
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t border-dotted border-muted-foreground" /> {goal.kind === "reserve" ? "Minimum" : "Target"}
        </span>
      </div>
      <div ref={ref} className="relative px-0">
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${goal.name}: ${evaluation.funded} of ${evaluation.target} ${unit} funded`}
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGElement).getBoundingClientRect();
              const px = e.clientX - r.left;
              setHover(startMs + ((px - PAD.left) / plotW) * (endMs - startMs));
            }}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-subtle text-[10px]">
                  {formatAmount(String(t), 2)}
                </text>
              </g>
            ))}
            <text x={PAD.left} y={H - 6} className="num fill-subtle text-[10px]">{goal.startDate}</text>
            <text x={PAD.left + plotW} y={H - 6} textAnchor="end" className="num fill-subtle text-[10px]">
              {msToIsoDate(endMs)}
            </text>

            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(target)} y2={y(target)} className="stroke-muted-foreground" strokeDasharray="1 3" strokeWidth={1} />
            {plan && planEndMs && (
              <line x1={x(startMs)} y1={y(0)} x2={x(planEndMs)} y2={y(target)} className="stroke-chart-4" strokeDasharray="4 4" strokeWidth={2} />
            )}
            <line x1={x(asOfMs)} x2={x(asOfMs)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-border" strokeWidth={1} />
            <text
              x={x(asOfMs)}
              y={PAD.top - 4}
              textAnchor={x(asOfMs) < PAD.left + 24 ? "start" : x(asOfMs) > PAD.left + plotW - 24 ? "end" : "middle"}
              dx={x(asOfMs) < PAD.left + 24 ? 4 : 0}
              className="fill-subtle text-[10px]"
            >
              Today
            </text>
            <path d={stepPath} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" />
            <circle cx={x(asOfMs)} cy={y(Number(earmarkedAt(asOfMs)))} r={4} className="fill-chart-1 stroke-surface" strokeWidth={2} />

            {hoverMs !== null && (
              <g>
                <line x1={x(hoverMs)} x2={x(hoverMs)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-muted-foreground" strokeWidth={1} />
                <circle cx={x(hoverMs)} cy={y(Number(earmarkedAt(hoverMs)))} r={4} className="fill-chart-1 stroke-surface" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hoverMs !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: Math.min(x(hoverMs) + 8, Math.max(width - 170, 0)) }}
          >
            <div className="num text-muted-foreground">{msToIsoDate(hoverMs)}</div>
            <div className="num">
              Earmarked {formatAmount(earmarkedAt(hoverMs))} {unit}
            </div>
            {planAt(hoverMs) !== null && (
              <div className="num text-muted-foreground">
                Plan {formatAmount(planAt(hoverMs)!.toFixed(2), 2)} {unit}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
