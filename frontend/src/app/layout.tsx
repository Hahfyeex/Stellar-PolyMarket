import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stella Polymarket",
  description: "Decentralized prediction markets on Stellar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
