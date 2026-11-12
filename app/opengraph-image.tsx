import { ImageResponse } from "next/og";

export const alt = "Mosaic Vault. More collateral. More access to Bitcoin-backed liquidity.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GEIST_SEMIBOLD =
  "https://raw.githubusercontent.com/vercel/geist-font/main/packages/next/dist/fonts/geist-sans/Geist-SemiBold.ttf";

async function loadSemibold(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(GEIST_SEMIBOLD);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const semibold = await loadSemibold();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F7F6F3",
          color: "#0F1F3D",
          padding: "72px 80px",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="#0F1F3D">
            <rect x="2" y="2" width="9" height="9" rx="2" />
            <rect x="13" y="2" width="9" height="9" rx="2" />
            <rect x="2" y="13" width="9" height="9" rx="2" />
            <rect x="14.5" y="14.5" width="7.5" height="7.5" rx="1.8" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Mosaic Vault
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.1,
              maxWidth: 980,
            }}
          >
            More collateral. More access to Bitcoin-backed liquidity.
          </div>
          <div style={{ fontSize: 28, color: "#475467", lineHeight: 1.4 }}>
            Isolated collateral vaults that borrow MUSD on Mezo. Testnet MVP.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "2px solid #E3E0D9",
            paddingTop: 28,
            fontSize: 24,
            color: "#475467",
          }}
        >
          <div>Mezo Testnet</div>
          <div>Chain ID 31611</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: semibold
        ? [{ name: "Geist", data: semibold, style: "normal", weight: 600 }]
        : undefined,
    },
  );
}
