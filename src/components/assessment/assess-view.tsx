"use client";

import { useMemo, useState } from "react";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState, ErrorState, TableSkeleton, type DisplayError } from "@/components/common/states";
import { fetchJson, toDisplayError, useApiResource } from "@/components/common/use-api-resource";
import { Answer } from "@/components/layout/copilot-panel";
import { useWatchAddress } from "@/components/providers/watch-context";
import { Button } from "@/components/ui/button";
import { knownAssets } from "@/modules/portfolio/assets";
import type { PortfolioSnapshot } from "@/modules/portfolio/portfolio.types";
import type { CopilotResponse } from "@/modules/ai/ai.types";
import type { TransferAssessment } from "@/modules/assessment/transfer.types";
import { AssessForm, type AssetOption, type TransferInput } from "./assess-form";
import { DecisionForm, FindingsByCategory, PillarPanels, VerdictBand } from "./assessment-result";

const JSON_HEADERS = { "content-type": "application/json" };

export function AssessView() {
  const { address } = useWatchAddress();
  const portfolio = useApiResource<PortfolioSnapshot>(address ? `/api/portfolio/${address}?limit=1` : null);
  const [input, setInput] = useState<TransferInput | null>(null);
  const [result, setResult] = useState<TransferAssessment | null>(null);
  const [error, setError] = useState<DisplayError | null>(null);
  const [pending, setPending] = useState(false);
  const [explain, setExplain] = useState<{ pending: boolean; response: CopilotResponse | null; error: DisplayError | null }>({ pending: false, response: null, error: null });
  const [decision, setDecision] = useState<{ saving: boolean; saved: boolean; error: DisplayError | null }>({ saving: false, saved: false, error: null });

  const assets: AssetOption[] = useMemo(() => {
    const held = portfolio.state.status === "ready" ? portfolio.state.data.holdings.filter((h) => h.decimals !== null) : [];
    const list: AssetOption[] = held.map((h) => ({ coinType: h.coinType, symbol: h.symbol, balance: h.amount }));
    for (const k of knownAssets("testnet")) if (!list.some((a) => a.coinType === k.coinType)) list.push({ coinType: k.coinType, symbol: k.symbol, balance: null });
    return list;
  }, [portfolio.state]);

  const run = (next: TransferInput) => {
    if (!address) return;
    setInput(next);
    setPending(true);
    setError(null);
    setExplain({ pending: false, response: null, error: null });
    setDecision({ saving: false, saved: false, error: null });
    fetchJson<TransferAssessment>("/api/assessments/transfer", undefined, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ address, ...next }) })
      .then(setResult)
      .catch((err) => {
        setResult(null);
        setError(toDisplayError(err));
      })
      .finally(() => setPending(false));
  };

  const askAi = () => {
    if (!address || !input) return;
    setExplain({ pending: true, response: null, error: null });
    fetchJson<CopilotResponse>("/api/assessments/transfer/explain", undefined, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ address, ...input }) })
      .then((response) => setExplain({ pending: false, response, error: null }))
      .catch((err) => setExplain({ pending: false, response: null, error: toDisplayError(err) }));
  };

  const saveDecision = (d: "would_proceed" | "would_not_proceed", note: string) => {
    if (!address || !input) return;
    setDecision({ saving: true, saved: false, error: null });
    fetchJson("/api/assessments/transfer/decision", undefined, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ address, ...input, decision: d, note: note || null }) })
      .then(() => setDecision({ saving: false, saved: true, error: null }))
      .catch((err) => setDecision({ saving: false, saved: false, error: toDisplayError(err) }));
  };

  if (!address) {
    return (
      <PageContainer>
        <PageHeader title="Transfer check" />
        <Panel>
          <EmptyState title="Analyze a Sui address" description="Enter a public Sui Testnet address above, then simulate a transfer from it." />
        </Panel>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Transfer check"
        description="Evaluate a hypothetical transfer before you make it, across Protect, Save, Invest and your memory."
      />
      <div className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-[13px]">
        <span className="font-medium">Simulation only.</span>{" "}
        <span className="text-muted-foreground">
          Guardian does not build, sign or send transactions, and it cannot block transfers made in your wallet. Gas figures are estimates from this wallet&apos;s history, not quotes.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Panel title="Hypothetical transfer">
            {portfolio.state.status === "loading" ? (
              <TableSkeleton rows={3} cols={2} />
            ) : portfolio.state.status === "error" ? (
              <ErrorState error={portfolio.state.error} onRetry={portfolio.refresh} />
            ) : (
              <AssessForm key={address} address={address} assets={assets} pending={pending} onSubmit={run} />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          {error && (
            <Panel>
              <ErrorState error={error} />
            </Panel>
          )}
          {pending && (
            <Panel title="Assessing">
              <TableSkeleton rows={5} cols={3} />
            </Panel>
          )}
          {!pending && !result && !error && (
            <Panel>
              <EmptyState title="No simulation yet" description="Enter a recipient, asset and amount. Guardian checks onchain history, your balances and goals, your allocation and your memory, then explains the result." />
            </Panel>
          )}
          {!pending && result && (
            <>
              <VerdictBand a={result} />
              <FindingsByCategory a={result} />
              <PillarPanels a={result} />
              <Panel
                title="Explanation"
                meta="Gemini, grounded in the findings above"
                actions={
                  <Button size="sm" variant="outline" onClick={askAi} disabled={explain.pending}>
                    {explain.pending ? "Explaining…" : explain.response ? "Explain again" : "Explain with AI"}
                  </Button>
                }
              >
                <div className="px-4 py-3">
                  {explain.error ? (
                    <ErrorState error={explain.error} />
                  ) : explain.response ? (
                    <Answer r={explain.response} />
                  ) : (
                    <p className="text-[13px] text-subtle">The explanation restates the deterministic result with citations. It never changes the verdict.</p>
                  )}
                </div>
              </Panel>
              <Panel title="Your decision" meta="Saved to memory and recalled in later checks of this recipient">
                <DecisionForm onSave={saveDecision} saving={decision.saving} saved={decision.saved} />
                {decision.error && <ErrorState error={decision.error} />}
              </Panel>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
