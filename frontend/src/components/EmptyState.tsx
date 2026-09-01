import React from "react";
import Link from "next/link";

export type EmptyStateVariant =
  | "no-markets"
  | "no-bets"
  | "no-notifications"
  | "wallet-disconnected"
  | "custom";

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  message?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  href?: string;
  customIllustration?: React.ReactNode;
  className?: string;
}

// ── SVG Illustrations matching Stellar Polymarket Dark Theme (Purple/Blue Palette) ──

export const NoMarketsIllustration = ({ className = "w-40 h-40" }: { className?: string }) => (
  <svg
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="No markets illustration"
  >
    <defs>
      <linearGradient id="nm-grad1" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop stopColor="#8B5CF6" stopOpacity="0.25" />
        <stop offset="1" stopColor="#3B82F6" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="nm-grad2" x1="50" y1="50" x2="150" y2="150" gradientUnits="userSpaceOnUse">
        <stop stopColor="#A855F7" />
        <stop offset="1" stopColor="#6366F1" />
      </linearGradient>
      <filter id="nm-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#nm-grad1)" />
    <circle cx="100" cy="100" r="70" stroke="#8B5CF6" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="4 4" />
    
    {/* Chart Grid Lines */}
    <path d="M50 140H150" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M50 110H150" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
    <path d="M50 80H150" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
    
    {/* Search & Market Chart Silhouette */}
    <path
      d="M55 130L85 105L110 120L145 75"
      stroke="url(#nm-grad2)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#nm-glow)"
    />
    <circle cx="145" cy="75" r="4" fill="#38BDF8" />
    <circle cx="110" cy="120" r="3.5" fill="#A855F7" />
    <circle cx="85" cy="105" r="3.5" fill="#8B5CF6" />

    {/* Magnifying Glass Searching */}
    <circle cx="125" cy="125" r="22" stroke="#C084FC" strokeWidth="3" fill="#0F172A" />
    <line x1="141" y1="141" x2="160" y2="160" stroke="#C084FC" strokeWidth="4" strokeLinecap="round" />
    <path d="M118 125H132M125 118V132" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const NoBetsIllustration = ({ className = "w-40 h-40" }: { className?: string }) => (
  <svg
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="No bets illustration"
  >
    <defs>
      <linearGradient id="nb-grad1" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366F1" stopOpacity="0.25" />
        <stop offset="1" stopColor="#EC4899" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="nb-ticket" x1="60" y1="60" x2="140" y2="140" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1E1B4B" />
        <stop offset="1" stopColor="#0F172A" />
      </linearGradient>
      <filter id="nb-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#nb-grad1)" />
    <circle cx="100" cy="100" r="70" stroke="#6366F1" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="4 4" />

    {/* Bet Ticket Silhouette */}
    <g transform="rotate(-6 100 100)">
      <rect
        x="62"
        y="52"
        width="76"
        height="96"
        rx="8"
        fill="url(#nb-ticket)"
        stroke="#818CF8"
        strokeWidth="2"
      />
      <circle cx="62" cy="100" r="6" fill="#0B0F17" />
      <circle cx="138" cy="100" r="6" fill="#0B0F17" />
      <line x1="72" y1="100" x2="128" y2="100" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" />
      
      {/* Ticket Content Lines */}
      <rect x="74" y="66" width="36" height="6" rx="3" fill="#A855F7" />
      <rect x="74" y="78" width="52" height="4" rx="2" fill="#475569" />
      <rect x="74" y="114" width="40" height="5" rx="2.5" fill="#38BDF8" />
      <rect x="74" y="125" width="24" height="4" rx="2" fill="#64748B" />
    </g>

    {/* Sparkle Glow Elements */}
    <path d="M145 45L148 55L158 58L148 61L145 71L142 61L132 58L142 55Z" fill="#F472B6" filter="url(#nb-glow)" />
    <circle cx="50" cy="75" r="2.5" fill="#818CF8" />
    <circle cx="155" cy="130" r="3" fill="#38BDF8" />
  </svg>
);

export const NoNotificationsIllustration = ({ className = "w-40 h-40" }: { className?: string }) => (
  <svg
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="No notifications illustration"
  >
    <defs>
      <linearGradient id="nn-grad1" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop stopColor="#8B5CF6" stopOpacity="0.25" />
        <stop offset="1" stopColor="#06B6D4" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="nn-bell" x1="70" y1="60" x2="130" y2="140" gradientUnits="userSpaceOnUse">
        <stop stopColor="#A855F7" />
        <stop offset="1" stopColor="#3B82F6" />
      </linearGradient>
      <filter id="nn-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#nn-grad1)" />
    <circle cx="100" cy="100" r="70" stroke="#8B5CF6" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="4 4" />

    {/* Sleeping / Quiet Bell Silhouette */}
    <path
      d="M100 52C82 52 72 66 72 88V114L62 126V132H138V126L128 114V88C128 66 118 52 100 52Z"
      fill="#1E1B4B"
      stroke="url(#nn-bell)"
      strokeWidth="2.5"
    />
    <circle cx="100" cy="46" r="5" stroke="#A855F7" strokeWidth="2.5" fill="#0F172A" />
    <path d="M90 134C90 139.5 94.5 144 100 144C105.5 144 110 139.5 110 134" stroke="#818CF8" strokeWidth="2.5" />
    
    {/* Zzz calm indicators */}
    <path d="M138 68H148L138 80H148" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M152 50H160L152 60H160" stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="65" cy="70" r="3" fill="#A855F7" opacity="0.6" />
  </svg>
);

export const WalletDisconnectedIllustration = ({ className = "w-40 h-40" }: { className?: string }) => (
  <svg
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="Wallet disconnected illustration"
  >
    <defs>
      <linearGradient id="wd-grad1" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3B82F6" stopOpacity="0.25" />
        <stop offset="1" stopColor="#8B5CF6" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="wd-wallet" x1="55" y1="65" x2="145" y2="135" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1E1B4B" />
        <stop offset="1" stopColor="#0F172A" />
      </linearGradient>
      <filter id="wd-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#wd-grad1)" />
    <circle cx="100" cy="100" r="70" stroke="#3B82F6" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="4 4" />

    {/* Wallet Card Body */}
    <rect
      x="52"
      y="66"
      width="96"
      height="68"
      rx="10"
      fill="url(#wd-wallet)"
      stroke="#6366F1"
      strokeWidth="2.5"
    />
    <path d="M52 82C65 82 135 82 148 82" stroke="#334155" strokeWidth="1.5" />

    {/* Wallet Flap / Lock */}
    <path
      d="M124 90H150C152.2 90 154 91.8 154 94V106C154 108.2 152.2 110 150 110H124C121.8 110 120 108.2 120 106V94C120 91.8 121.8 90 124 90Z"
      fill="#1E1B4B"
      stroke="#A855F7"
      strokeWidth="2"
    />
    <circle cx="137" cy="100" r="3.5" fill="#38BDF8" filter="url(#wd-glow)" />

    {/* Plug / Connection Link Icon */}
    <circle cx="68" cy="144" r="14" fill="#0F172A" stroke="#EF4444" strokeWidth="2" />
    <path d="M63 139L73 149M73 139L63 149" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const VARIANT_CONFIGS = {
  "no-markets": {
    illustration: <NoMarketsIllustration />,
    title: "No Markets Found",
    message: "No prediction markets match your current filter or search criteria. Try adjusting your query or create a new market.",
    ctaLabel: "Explore All Markets",
    defaultHref: "/markets",
  },
  "no-bets": {
    illustration: <NoBetsIllustration />,
    title: "No Bets Placed Yet",
    message: "You haven't participated in any prediction markets yet. Predict real-world outcomes and start earning rewards.",
    ctaLabel: "Place Your First Bet",
    defaultHref: "/markets",
  },
  "no-notifications": {
    illustration: <NoNotificationsIllustration />,
    title: "No Notifications Yet",
    message: "You're all caught up! When your positions update, markets resolve, or rewards are ready, they'll appear here.",
    ctaLabel: "Browse Markets",
    defaultHref: "/markets",
  },
  "wallet-disconnected": {
    illustration: <WalletDisconnectedIllustration />,
    title: "Wallet Not Connected",
    message: "Connect your Stellar Freighter wallet to place predictions, manage liquidity, and claim earnings.",
    ctaLabel: "Connect Wallet",
    defaultHref: undefined,
  },
  custom: {
    illustration: null,
    title: "No Data Available",
    message: "There is nothing to display here right now.",
    ctaLabel: "Go Back",
    defaultHref: "/",
  },
};

export default function EmptyState({
  variant = "no-markets",
  title,
  message,
  ctaLabel,
  onCtaClick,
  href,
  customIllustration,
  className = "",
}: EmptyStateProps) {
  const config = VARIANT_CONFIGS[variant] || VARIANT_CONFIGS["no-markets"];

  const resolvedIllustration = customIllustration || config.illustration;
  const resolvedTitle = title || config.title;
  const resolvedMessage = message || config.message;
  const resolvedCtaLabel = ctaLabel || config.ctaLabel;
  const resolvedHref = href !== undefined ? href : config.defaultHref;

  const renderCtaButton = () => {
    const buttonClass =
      "inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-purple-900/30 hover:shadow-purple-700/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95";

    if (resolvedHref && !onCtaClick) {
      return (
        <Link href={resolvedHref} className={buttonClass}>
          {resolvedCtaLabel}
        </Link>
      );
    }

    if (onCtaClick || resolvedHref) {
      return (
        <button
          type="button"
          onClick={onCtaClick}
          className={buttonClass}
        >
          {resolvedCtaLabel}
        </button>
      );
    }

    return null;
  };

  return (
    <div
      role="region"
      aria-label={resolvedTitle}
      className={`flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm ${className}`}
    >
      <div className="mb-5 flex items-center justify-center">{resolvedIllustration}</div>
      <h3 className="text-xl font-bold text-slate-100 mb-2 tracking-tight">{resolvedTitle}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">{resolvedMessage}</p>
      {renderCtaButton()}
    </div>
  );
}

export { EmptyState };
