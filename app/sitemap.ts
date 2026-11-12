import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-06");
  return [
    { url: `${APP_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${APP_URL}/collateral`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${APP_URL}/dashboard`, lastModified, changeFrequency: "weekly", priority: 0.6 },
  ];
}
