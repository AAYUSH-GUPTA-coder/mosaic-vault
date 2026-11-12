"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { Toaster } from "@/components/ui/sonner";
import { mezoTestnet } from "@/lib/blockchain/chains";
import { wagmiConfig } from "@/lib/blockchain/wagmi";

/** Follows `data-theme` on <html> (set by the root layout script and the theme toggle). */
function useHtmlTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.getAttribute("data-theme") === "dark" ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

const rkLight = lightTheme({
  accentColor: "#1e3a8a",
  accentColorForeground: "#ffffff",
  borderRadius: "small",
  fontStack: "system",
});
const rkDark = darkTheme({
  accentColor: "#7f9ce6",
  accentColorForeground: "#0e1116",
  borderRadius: "small",
  fontStack: "system",
});

export default function Providers({ children }: { children: ReactNode }) {
  const theme = useHtmlTheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  const rkTheme = useMemo(() => (theme === "dark" ? rkDark : rkLight), [theme]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} initialChain={mezoTestnet} modalSize="compact">
          {children}
          <Toaster theme={theme} position="bottom-right" closeButton />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
