import type { Metadata } from "next";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Savings" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Savings" description="Savings goals, progress and monthly contribution planning." />
      <Panel>
        <EmptyState
          title="Not available yet"
          description="This module is scheduled for Phase 4 of the implementation plan. No placeholder data is shown."
        />
      </Panel>
    </PageContainer>
  );
}
