import { Activity, Archive, ArrowRightLeft, LayoutGrid, PiggyBank, ShieldCheck } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/security", label: "Security", icon: ShieldCheck },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/strategy", label: "Strategy", icon: Activity },
  { href: "/assess", label: "Transfer check", icon: ArrowRightLeft },
  { href: "/memory", label: "Financial memory", icon: Archive },
] as const;
