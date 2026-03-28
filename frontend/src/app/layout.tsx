import type { Metadata } from "next";
import "./globals.css";
import { BettingSlipProvider } from "../context/BettingSlipContext";
import { WalletProvider } from "../context/WalletContext";
import BettingSlipWrapper from "../components/BettingSlipWrapper";
import ReduxProvider from "../components/ReduxProvider";
import SkipLink from "../components/SkipLink";
import ReactQueryProvider from "../components/ReactQueryProvider";
import ThemeScript from "../components/ThemeScript";

export const metadata: Metadata = {
  title: "Stella Polymarket",
  description: "Decentralized prediction markets on Stellar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script — sets data-theme before first paint to prevent FOUC */}
        <ThemeScript />
      </head>
      <body>
        <SkipLink />
        <ReduxProvider>
          <ReactQueryProvider>
            {/* WalletProvider lifts wallet state globally so BettingSlip can submit */}
            <WalletProvider>
              <BettingSlipProvider>
                <main id="main-content" role="main">
                  {children}
                </main>
                {/* BettingSlip mounted globally — persists across all pages */}
                <BettingSlipWrapper />
              </BettingSlipProvider>
            </WalletProvider>
          </ReactQueryProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
