import type { Metadata } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand/logo";
import { OG_IMAGE, SITE_DESCRIPTION } from "@/lib/site";
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

// Next merges metadata shallowly, so `openGraph` here must repeat the image
// from the root layout or the page would lose it.
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: BRAND_NAME,
    locale: "en_US",
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: SITE_DESCRIPTION, images: [OG_IMAGE] },
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
