import type { Metadata } from "next";
import "./globals.css";
import { BettingSlipProvider } from "../context/BettingSlipContext";
import { WalletProvider } from "../context/WalletContext";
import BettingSlipWrapper from "../components/BettingSlipWrapper";
import ReduxProvider from "../components/ReduxProvider";
import ReactQueryProvider from "../components/ReactQueryProvider";

export const metadata: Metadata = {
  title: "Stella Polymarket",
  description: "Decentralized prediction markets on Stellar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ReduxProvider>
          {/* ReactQueryProvider enables useIPFSMetadata and future query hooks */}
          <ReactQueryProvider>
            {/* WalletProvider lifts wallet state globally so BettingSlip can submit */}
            <WalletProvider>
              <BettingSlipProvider>
                {children}
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
