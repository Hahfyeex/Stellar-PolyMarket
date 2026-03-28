"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRecentActivity, formatWallet, ActivityItem } from "../hooks/useRecentActivity";

// Demo items shown when the feed is empty or the API is unreachable
const DEMO_ITEMS: ActivityItem[] = [
  {
    id: 1,
    wallet_address: "GBXYZ1234ABCDE",
    outcome_index: 0,
    amount: "150.00",
    created_at: new Date().toISOString(),
    question: "Will Bitcoin reach $100k before 2027?",
    outcomes: ["Yes", "No"],
  },
  {
    id: 2,
    wallet_address: "GCDEF5678FGHIJ",
    outcome_index: 1,
    amount: "75.50",
    created_at: new Date().toISOString(),
    question: "Will Arsenal win the Premier League?",
    outcomes: ["Yes", "No"],
  },
  {
    id: 3,
    wallet_address: "GABC9012KLMNO",
    outcome_index: 0,
    amount: "200.00",
    created_at: new Date().toISOString(),
    question: "Will Nigeria inflation drop below 15%?",
    outcomes: ["Yes", "No"],
  },
];

interface Props {
  apiUrl?: string;
}

export default function SocialTicker({ apiUrl }: Props) {
  const url = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const { items, error } = useRecentActivity(url, 10);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const display = items.length > 0 ? items : DEMO_ITEMS;

  return (
    <div
      className="w-full bg-gray-900 border-y border-gray-800 overflow-hidden"
      // Pause scrolling animation on hover to let users read items
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Live betting activity"
    >
      {/* Live indicator */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-800">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Live Bets
        </span>
        {(error || items.length === 0) && <span className="ml-2 text-xs text-gray-600">demo</span>}
      </div>

      {/* Scrolling track */}
      <div className="relative flex py-2 overflow-hidden">
        <motion.div
          ref={trackRef}
          className="flex gap-6 px-4 whitespace-nowrap"
          animate={paused ? { x: 0 } : { x: [0, -1000] }}
          transition={
            paused
              ? { duration: 0 }
              : { duration: 30, ease: "linear", repeat: Infinity, repeatType: "loop" }
          }
        >
          <AnimatePresence initial={false}>
            {display.map((item) => {
              const outcome = item.outcomes[item.outcome_index] ?? `Outcome ${item.outcome_index}`;
              return (
                <motion.span
                  key={item.id}
                  className="inline-flex items-center gap-1.5 text-sm shrink-0"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="font-mono text-blue-400">
                    {formatWallet(item.wallet_address)}
                  </span>
                  <span className="text-gray-400">staked</span>
                  <span className="font-semibold text-white">{item.amount} XLM</span>
                  <span className="text-gray-400">on</span>
                  <span className="text-green-400 font-medium">{outcome}</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-500 truncate max-w-[180px]">{item.question}</span>
                  <span className="text-gray-700 mx-2">|</span>
                </motion.span>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* Fade edges for a clean scroll effect */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-gray-900 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-gray-900 to-transparent" />
      </div>
    </div>
  );
}
