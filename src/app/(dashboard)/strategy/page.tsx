import type { Metadata } from "next";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Strategy" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Strategy" description="Current versus target allocation, drift and illustrative rebalancing." />
      <Panel>
        <EmptyState
          title="Not available yet"
          description="This module is scheduled for Phase 5 of the implementation plan. No placeholder data is shown."
        />
      </Panel>
    </PageContainer>
  );
}
