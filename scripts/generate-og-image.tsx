/**
 * Renders the 1200×630 social preview to public/og-image.png.
 * Re-run after changing the brand, tagline or palette, and commit the PNG.
 *
 *   npm run og:image
 */
import { writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand/logo";
import { OG_IMAGE } from "@/lib/site";

// Satori renders hex/rgb colours only; these mirror the landing-page tokens.
const INK = "#080c16";
const FG = "#f2f4f8";
const MUTED = "#a3abbd";
const SUBTLE = "#6f7891";
const CYAN = "#6fd3e6";
const BLUE = "#4f86f7";
const SHIELD = "M8 1.5 2.5 3.75v4.1c0 3.1 2.3 5.6 5.5 6.65 3.2-1.05 5.5-3.55 5.5-6.65v-4.1L8 1.5Z";

const [line1, line2] = BRAND_TAGLINE.split(". ").map((s, i, a) => (i < a.length - 1 ? `${s}.` : s));

const image = new ImageResponse(
  (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: INK,
        backgroundImage: "radial-gradient(ellipse 65% 75% at 30% 0%, rgba(79,134,247,0.24), transparent 70%)",
        color: FG,
      }}
    >
      {/* Large faint shield on the right, echoing the logo. */}
      <svg width="460" height="460" viewBox="0 0 16 16" style={{ position: "absolute", right: -80, top: 85, opacity: 0.13 }}>
        <path d={SHIELD} fill="none" stroke={CYAN} strokeWidth="0.35" strokeLinejoin="round" />
      </svg>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 16 16">
            <path d={SHIELD} fill="none" stroke={CYAN} strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>{BRAND_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1 }}>{line1}</div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.045em",
              lineHeight: 1.1,
              backgroundImage: `linear-gradient(100deg, ${FG} 10%, ${CYAN} 60%, ${BLUE} 100%)`,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {line2}
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: MUTED }}>Meet the financial copilot that remembers. Built on Sui.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 22, color: MUTED }}>
          <div style={{ display: "flex", gap: 28 }}>
            {["Protect", "Save", "Invest", "Memory"].map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: CYAN }} />
                {p}
              </div>
            ))}
          </div>
          <div style={{ color: SUBTLE }}>Sui Testnet</div>
        </div>
      </div>
    </div>
  ),
  { width: OG_IMAGE.width, height: OG_IMAGE.height },
);

async function main() {
  const out = `public${OG_IMAGE.url}`;
  await writeFile(out, Buffer.from(await image.arrayBuffer()));
  console.log(`wrote ${out} (${OG_IMAGE.width}×${OG_IMAGE.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
