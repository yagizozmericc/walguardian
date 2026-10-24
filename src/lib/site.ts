/**
 * Public origin used for absolute metadata URLs (Open Graph, sitemap).
 *
 * Order: an explicit SITE_URL, then the URLs Vercel injects at build and run
 * time (branch URL on preview deployments, the production domain otherwise),
 * then localhost for local development. Social crawlers need an absolute,
 * publicly reachable https URL, so the localhost fallback must never reach a
 * deployed build.
 */
export function siteUrl(): URL {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit);
    } catch {
      // Malformed SITE_URL: fall through to the platform defaults rather than failing the build.
    }
  }
  const preview = process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL : undefined;
  const host = preview || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) return new URL(`https://${host}`);
  return new URL("http://localhost:3000");
}

export const GITHUB_URL = "https://github.com/yagizozmericc/walguardian";

export const SITE_DESCRIPTION =
  "The financial copilot that remembers. Security intelligence, savings goals, portfolio insights and financial memory for your Sui wallet, in one place.";

/** Static social preview served from `public/og-image.png` (regenerate with `npm run og:image`). */
export const OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Walguardian — Your Money. A Smarter Memory.",
} as const;
