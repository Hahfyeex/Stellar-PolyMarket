import type { Metadata } from "next";
import "./globals.css";
import { BettingSlipProvider } from "../context/BettingSlipContext";
import { WalletProvider } from "../context/WalletContext";
import BettingSlipWrapper from "../components/BettingSlipWrapper";
import ReduxProvider from "../components/ReduxProvider";
import ReactQueryProvider from "../components/ReactQueryProvider";
import SkipLink from "../components/SkipLink";
import ThemeScript from "../components/ThemeScript";
import OfflineBanner from "../components/OfflineBanner";
import KeyboardShortcutsProvider from "../components/KeyboardShortcutsProvider";
import I18nProvider from "../components/I18nProvider";

export const metadata: Metadata = {
  title: "Stella Polymarket",
  description: "Decentralized prediction markets on Stellar",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stella",
  },
};

import { ToastProvider } from "../components/ToastProvider";
import { ChartThemeProvider } from "../components/ChartThemeProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script — sets data-theme before first paint to prevent FOUC */}
        <ThemeScript />
      </head>
      <body>
        <SkipLink />
        <OfflineBanner />
        {/* I18nProvider initialises i18next with dynamic JSON loading and browser locale detection */}
        <I18nProvider>
          <ReduxProvider>
            {/* ReactQueryProvider enables useIPFSMetadata and future query hooks */}
            <ReactQueryProvider>
              {/* WalletProvider lifts wallet state globally so BettingSlip can submit */}
              <WalletProvider>
                <ToastProvider>
                  <ChartThemeProvider>
                    <BettingSlipProvider>
                      <main id="main-content" role="main">
                        {children}
                      </main>
                      {/* BettingSlip mounted globally — persists across all pages */}
                      <BettingSlipWrapper />
                      {/* Global keyboard shortcuts (B, /, Esc, ?) */}
                      <KeyboardShortcutsProvider />
                    </BettingSlipProvider>
                  </ChartThemeProvider>
                </ToastProvider>
              </WalletProvider>
            </ReactQueryProvider>
          </ReduxProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
