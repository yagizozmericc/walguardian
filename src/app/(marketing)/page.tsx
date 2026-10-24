import type { Metadata } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand/logo";
import { Copilot } from "@/components/marketing/copilot";
import { Ecosystem } from "@/components/marketing/ecosystem";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Memory } from "@/components/marketing/memory";
import { Pillars } from "@/components/marketing/pillars";
import { Problem } from "@/components/marketing/problem";
import { TransferCheck } from "@/components/marketing/transfer-check";
import { Trust } from "@/components/marketing/trust";

const TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
const DESCRIPTION =
  "The financial copilot that remembers. Security intelligence, savings goals, portfolio insights and financial memory for your Sui wallet, in one place.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: BRAND_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Pillars />
      <Memory />
      <TransferCheck />
      <Copilot />
      <HowItWorks />
      <Ecosystem />
      <Trust />
      <FinalCta />
    </>
  );
}
