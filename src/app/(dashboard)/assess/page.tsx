import type { Metadata } from "next";
import { AssessView } from "@/components/assessment/assess-view";

export const metadata: Metadata = { title: "Transfer check" };

export default function AssessPage() {
  return <AssessView />;
}
