import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand/logo";
import { OG_IMAGE, SITE_DESCRIPTION, siteUrl } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

const SOCIAL_TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: BRAND_NAME,
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    locale: "en_US",
    title: SOCIAL_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable} antialiased`}>
      <body>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
