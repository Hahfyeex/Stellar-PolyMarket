"use client";
import { useRecentActivity, formatWallet, formatRelativeTime, ActivityItem } from "../hooks/useRecentActivity";

// Demo data shown when the API is offline
const DEMO_ACTIVITY: ActivityItem[] = [
  { id: 1, wallet_address: "GBXYZ1234ABCD", outcome_index: 0, amount: "150.00", created_at: new Date(Date.now() - 30000).toISOString(), question: "Will Bitcoin reach $100k before 2027?", outcomes: ["Yes", "No"] },
  { id: 2, wallet_address: "GCDEF5678EFGH", outcome_index: 1, amount: "75.50", created_at: new Date(Date.now() - 90000).toISOString(), question: "Will Arsenal win the Premier League?", outcomes: ["Yes", "No"] },
  { id: 3, wallet_address: "GABC9012IJKL", outcome_index: 0, amount: "200.00", created_at: new Date(Date.now() - 180000).toISOString(), question: "Will Nigeria inflation drop below 15%?", outcomes: ["Yes", "No"] },
  { id: 4, wallet_address: "GHIJ3456MNOP", outcome_index: 1, amount: "50.25", created_at: new Date(Date.now() - 300000).toISOString(), question: "Will Bitcoin reach $100k before 2027?", outcomes: ["Yes", "No"] },
  { id: 5, wallet_address: "GKLM7890QRST", outcome_index: 0, amount: "320.00", created_at: new Date(Date.now() - 600000).toISOString(), question: "Will Arsenal win the Premier League?", outcomes: ["Yes", "No"] },
];

interface Props {
  apiUrl?: string;
}

export default function LiveActivityFeed({ apiUrl }: Props) {
  const url = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const { items, newIds, error } = useRecentActivity(url);

  const display = error || items.length === 0 ? DEMO_ACTIVITY : items;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <h2 className="text-sm font-semibold text-white">Live Activity</h2>
        {(error || items.length === 0) && (
          <span className="ml-auto text-xs text-gray-500">demo data</span>
        )}
      </div>

      {/* Feed */}
      <ul className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
        {display.map((item) => {
          const isNew = newIds.has(item.id);
          const outcome = item.outcomes[item.outcome_index] ?? `Outcome ${item.outcome_index}`;
          return (
            <li
              key={item.id}
              className={`px-5 py-3 flex items-center justify-between gap-3 transition-all duration-700
                ${isNew ? "activity-fade-in bg-blue-950/40" : "bg-transparent"}`}
            >
              <div className="min-w-0">
                <p className="text-xs text-gray-400 truncate">{item.question}</p>
                <p className="text-sm text-white mt-0.5">
                  <span className="font-mono text-blue-400">{formatWallet(item.wallet_address)}</span>
                  {" bet "}
                  <span className="font-semibold text-white">{item.amount} XLM</span>
                  {" on "}
                  <span className="text-green-400 font-medium">{outcome}</span>
                </p>
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                {formatRelativeTime(item.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
