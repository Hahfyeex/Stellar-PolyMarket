"use client";
// BottomNavBar — fixed 4-tab navigation with safe-area support
import { useTranslation } from "react-i18next";

export type NavTab = "home" | "search" | "portfolio" | "leaderboard" | "profile";

interface Props {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  unreadCount?: number;
}

/** Icon definitions — labels are injected at render time via i18n */
const TAB_ICONS: { id: NavTab; icon: React.ReactNode }[] = [
  {
    id: "home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: "search",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
      </svg>
    ),
  },
  {
    id: "portfolio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 relative">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        {/* Notification badge */}
        {unreadCount !== undefined && unreadCount > 0 && (
          <span className="absolute -top-1.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none shadow-lg" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </svg>
    ),
  },
  {
    id: "leaderboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.34 6.43a4.47 4.47 0 005.24 0M6.43 7.34a4.47 4.47 0 000 5.24M6.43 16.66a4.47 4.47 0 005.24 0M16.66 6.43a4.47 4.47 0 000 5.24M16.66 16.66a4.47 4.47 0 000-5.24" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l1.43 10.43L22 12l-9.57 0.86L12 2z" />
      </svg>
    ),
  },
  {
    id: "profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export default function BottomNavBar({ activeTab, onTabChange, unreadCount = 0 }: Props) {
  // All nav labels come from the "nav" section of common.json
  const { t } = useTranslation("common");

  return (
    <nav
      data-testid="bottom-nav-bar"
      className="fixed bottom-0 left-0 right-0 z-[100] bg-gray-950 border-t border-gray-800"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 1rem))" }}
    >
      <div className="flex h-[4.5rem] items-end">
        {TAB_ICONS.map((tab) => {
          const isActive = tab.id === activeTab;
          const label = t(`nav.${tab.id}`) || tab.id;
          const showBadge = tab.id === "portfolio" && unreadCount > 0;
          
          return (
            <button
              key={tab.id}
              data-testid={`nav-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              aria-label={`${label}${showBadge ? ` (${unreadCount})` : ""}`}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative p-2 text-xs font-medium transition-all duration-200 hover:scale-[1.02]
                ${isActive 
                  ? "text-blue-400 scale-105" 
                  : "text-gray-400 hover:text-gray-200"
                }`}
            >
              {/* Active indicator */}
              {isActive && (
                <span
                  data-testid={`nav-tab-${tab.id}-indicator`}
                  className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full shadow-sm"
                />
              )}
              <div className="relative">
                {tab.icon}
              </div>
              <span className="leading-none tracking-tight capitalize">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
