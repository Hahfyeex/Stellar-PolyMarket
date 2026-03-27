import type { Metadata } from "next";
import "./globals.css";
import { BettingSlipProvider } from "../context/BettingSlipContext";
import { WalletProvider } from "../context/WalletContext";
import BettingSlipWrapper from "../components/BettingSlipWrapper";
import ReduxProvider from "../components/ReduxProvider";
import I18nProvider from "../components/I18nProvider";
import SkipLink from "../components/SkipLink";

export const metadata: Metadata = {
  title: "Stella Polymarket",
  description: "Decentralized prediction markets on Stellar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <ReduxProvider>
          {/* I18nProvider initialises i18next on the client and supplies the
              instance to all useTranslation() hooks in the tree. */}
          <I18nProvider>
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
          </I18nProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
