import { AppShell } from "@/components/layout/app-shell";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { WalletProvider } from "@/components/providers/wallet-context";
import { WatchProvider } from "@/components/providers/watch-context";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <WatchProvider>
      <WalletProvider>
        <CopilotProvider>
          <AppShell>{children}</AppShell>
        </CopilotProvider>
      </WalletProvider>
    </WatchProvider>
  );
}
