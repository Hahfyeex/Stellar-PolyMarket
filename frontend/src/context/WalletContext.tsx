"use client";
/**
 * WalletContext
 * Lifts wallet state to a global provider so any component
 * (including BettingSlip) can access the connected wallet address.
 */
import { createContext, useContext, ReactNode } from "react";
import { useWallet } from "../hooks/useWallet";

interface WalletState {
  publicKey: string | null;
  isLoading: boolean;
  walletError: string | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used inside WalletProvider");
  return ctx;
}
