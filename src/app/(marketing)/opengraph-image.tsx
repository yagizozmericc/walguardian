import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/components/brand/logo";

export const alt = `${BRAND_NAME} — Your Money. A Smarter Memory.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori renders hex/rgb colours only; these mirror the landing-page tokens.
const INK = "#080c16";
const FG = "#f2f4f8";
const MUTED = "#a3abbd";
const CYAN = "#6fd3e6";
const BLUE = "#4f86f7";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: INK,
          backgroundImage: `radial-gradient(ellipse 60% 70% at 50% 0%, rgba(79,134,247,0.22), transparent 70%)`,
          color: FG,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="40" height="40" viewBox="0 0 16 16">
            <path
              d="M8 1.5 2.5 3.75v4.1c0 3.1 2.3 5.6 5.5 6.65 3.2-1.05 5.5-3.55 5.5-6.65v-4.1L8 1.5Z"
              fill="none"
              stroke={CYAN}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em" }}>{BRAND_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1 }}>Your Money.</div>
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              letterSpacing: "-0.045em",
              lineHeight: 1.08,
              backgroundImage: `linear-gradient(100deg, ${FG} 10%, ${CYAN} 60%, ${BLUE} 100%)`,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            A Smarter Memory.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: MUTED }}>Meet the financial copilot that remembers. Built on Sui.</div>
        </div>

        <div style={{ display: "flex", gap: 28, fontSize: 22, color: MUTED }}>
          {["Protect", "Save", "Invest", "Memory"].map((p) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: CYAN }} />
              {p}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
