"use client";

import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";
import { useWatchAddress } from "@/components/providers/watch-context";
import { shortAddress } from "@/lib/sui-address";

export function OverviewView() {
  const { address } = useWatchAddress();

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description={address ? <span className="font-mono">{shortAddress(address, 8)}</span> : undefined}
      />
      <Panel>
        <EmptyState
          title={address ? "Portfolio data not connected" : "Analyze a Sui address"}
          description={
            address
              ? "Balances and activity load through Tatum once the Sui Testnet integration is enabled."
              : "Enter a public Sui Testnet address in the bar above. Analysis is watch-only: it reads public onchain data and does not establish wallet ownership."
          }
        />
      </Panel>
    </PageContainer>
  );
}
