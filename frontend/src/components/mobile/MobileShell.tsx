"use client";
import { useState } from "react";
import BottomNavBar, { NavTab } from "./BottomNavBar";
import FloatingBetButton from "./FloatingBetButton";
import TradeDrawer from "./TradeDrawer";
import type { Market } from "../../types/market";

interface Props {
  children: React.ReactNode;
  activeMarket: Market | null;
  walletAddress: string | null;
  onBetPlaced?: () => void;
}

export default function MobileShell({ children, activeMarket, walletAddress, onBetPlaced }: Props) {
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openDrawer() {
    if (activeMarket) setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div
      data-testid="mobile-shell"
      className="relative min-h-screen"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Page content — add bottom padding so content isn't hidden behind nav bar */}
      <div className="pb-20">
        {children}
      </div>

      {/* Floating Bet Button */}
      <FloatingBetButton
        activeMarket={activeMarket}
        drawerOpen={drawerOpen}
        onPress={openDrawer}
      />

      {/* Bottom Nav Bar */}
      <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Trade Drawer */}
      <TradeDrawer
        market={activeMarket}
        open={drawerOpen}
        onClose={closeDrawer}
        walletAddress={walletAddress}
        onBetPlaced={onBetPlaced}
      />
    </div>
  );
}
