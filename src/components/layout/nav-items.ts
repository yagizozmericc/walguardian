import { Activity, Archive, LayoutGrid, PiggyBank, ShieldCheck } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/security", label: "Security", icon: ShieldCheck },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/strategy", label: "Strategy", icon: Activity },
  { href: "/memory", label: "Financial memory", icon: Archive },
] as const;
