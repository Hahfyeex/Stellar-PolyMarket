"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import BottomNavBar, { NavTab } from "./BottomNavBar";
import FloatingBetButton from "./FloatingBetButton";
import TradeDrawer from "./TradeDrawer";
import type { Market } from "../../types/market";

interface Props {
  children: React.ReactNode;
  activeMarket?: Market | null;
  walletAddress?: string | null;
  onBetPlaced?: () => void;
  unreadCount?: number;
}

export function useCurrentTab(pathname: string): NavTab {
  if (pathname === "/" || pathname.startsWith("/markets")) return "home";
  if (pathname === "/leaderboard") return "leaderboard";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/portfolio")) return "portfolio";
  return "home";
}

export default function MobileShell({ 
  children, 
  activeMarket, 
  walletAddress, 
  onBetPlaced, 
  unreadCount = 0 
}: Props) {
  const pathname = usePathname();
  const reduxUnreadCount = useSelector((state: RootState) => 
    state.notifications.items.filter((n) => !n.read).length
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const activeTab: NavTab = useCurrentTab(pathname);
  const currentUnreadCount = unreadCount || reduxUnreadCount;

  function openDrawer() {
    if (activeMarket) setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div
      data-testid="mobile-shell"
      className="relative min-h-[100dvh] safe-top"
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

