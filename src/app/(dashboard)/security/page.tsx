import type { Metadata } from "next";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Security" description="Behavioral profile, anomaly history and the reasoning behind each alert." />
      <Panel>
        <EmptyState
          title="Not available yet"
          description="This module is scheduled for Phase 3 of the implementation plan. No placeholder data is shown."
        />
      </Panel>
    </PageContainer>
  );
}
