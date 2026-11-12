import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mosaic Vault",
    short_name: "Mosaic Vault",
    description: "More collateral. More access to Bitcoin-backed liquidity.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#0f1f3d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
