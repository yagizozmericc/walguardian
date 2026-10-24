/** Public origin used for absolute metadata URLs (Open Graph, sitemap). */
export function siteUrl(): URL {
  const raw = process.env.SITE_URL?.trim();
  try {
    if (raw) return new URL(raw);
  } catch {
    // Malformed SITE_URL: fall through to the local default rather than failing the build.
  }
  return new URL("http://localhost:3000");
}

export const GITHUB_URL = "https://github.com/yagizozmericc/walguardian";
