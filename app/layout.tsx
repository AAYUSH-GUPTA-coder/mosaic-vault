import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "@/app/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DESCRIPTION = "More collateral. More access to Bitcoin-backed liquidity.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Mosaic Vault",
    template: "%s · Mosaic Vault",
  },
  description: DESCRIPTION,
  applicationName: "Mosaic Vault",
  openGraph: {
    type: "website",
    siteName: "Mosaic Vault",
    title: "Mosaic Vault",
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mosaic Vault",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
  width: "device-width",
  initialScale: 1,
};

/*
  Applies the stored theme before hydration so the page never flashes.
  Light is the default; dark only when localStorage "mv-theme" === "dark".
  Also marks that JS is running so the scroll reveal can start hidden.
*/
const themeScript = `(function(){try{var t=localStorage.getItem("mv-theme");var d=document.documentElement;if(t==="dark"){d.setAttribute("data-theme","dark")}else{d.setAttribute("data-theme","light")}d.setAttribute("data-js","")}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
