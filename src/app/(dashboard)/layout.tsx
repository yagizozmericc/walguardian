import { AppShell } from "@/components/layout/app-shell";
import { WatchProvider } from "@/components/providers/watch-context";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <WatchProvider>
      <AppShell>{children}</AppShell>
    </WatchProvider>
  );
}
