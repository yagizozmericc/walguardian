import type { Metadata } from "next";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Financial memory" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Financial memory" description="Every preference, goal, decision and piece of feedback stored in Walrus Memory, with source and timestamp." />
      <Panel>
        <EmptyState
          title="Not available yet"
          description="This module is scheduled for Phase 6 of the implementation plan. No placeholder data is shown."
        />
      </Panel>
    </PageContainer>
  );
}
