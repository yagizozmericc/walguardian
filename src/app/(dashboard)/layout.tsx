import { AppShell } from "@/components/layout/app-shell";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { WatchProvider } from "@/components/providers/watch-context";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <WatchProvider>
      <CopilotProvider>
        <AppShell>{children}</AppShell>
      </CopilotProvider>
    </WatchProvider>
  );
}
