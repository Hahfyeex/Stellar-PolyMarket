"use client";
import { useState, useRef, useEffect } from "react";
import BottomNavBar, { NavTab } from "./BottomNavBar";
import FloatingBetButton from "./FloatingBetButton";
import TradeDrawer from "./TradeDrawer";
import { useTheme } from "../../hooks/useTheme";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { useMetaThemeColor } from "../../hooks/useMetaThemeColor";
import type { Market } from "../../types/market";

interface Props {
  children: React.ReactNode;
  activeMarket?: Market | null;
  walletAddress?: string | null;
  onBetPlaced?: () => void;
  unreadCount?: number;
}

export default function MobileShell({
  children,
  activeMarket,
  walletAddress,
  onBetPlaced,
}: Props) {
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Get current theme and update meta theme-color
  const { theme } = useTheme();
  useMetaThemeColor(theme as "light" | "dark");

  // Restore scroll position when navigating
  useScrollRestoration(shellRef);

  function openDrawer() {
    if (activeMarket) setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div
      ref={shellRef}
      data-testid="mobile-shell"
      className="relative min-h-screen"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overscrollBehavior: "contain",
      }}
    >
      {/* Page content — standard mobile padding */}
      <div className="pb-[88px]"> {/* 64px nav + safe-area */}
        {children}
      </div>

      {/* Floating Bet Button */}
      <FloatingBetButton
        activeMarket={activeMarket}
        drawerOpen={drawerOpen}
        onPress={openDrawer}
      />

      {/* Bottom Nav Bar */}
      <BottomNavBar 
        activeTab={activeTab} 
        onTabChange={() => {}} 
        unreadCount={currentUnreadCount}
      />

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

