"use client";
/**
 * NotificationInbox
 *
 * Bell icon in the navbar that opens a dropdown inbox.
 * - Blue dot badge when unreadCount > 0
 * - Polls GET /api/notifications/:wallet every 30 seconds
 * - z-index: 1100 so the dropdown sits above all modals
 * - Click item → markRead; "Clear All" → clearAllNotifications
 */
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import {
  addNotification,
  markRead,
  clearAllNotifications,
  Notification,
  NotificationType,
} from "../store/notificationSlice";

// Icons per notification type
const TYPE_ICON: Record<NotificationType, string> = {
  MARKET_RESOLVED: "🏁",
  PAYOUT_AVAILABLE: "💰",
  MARKET_ENDING_SOON: "⏰",
};

const POLL_INTERVAL_MS = 30_000; // 30-second polling per spec

interface Props {
  walletAddress: string | null;
  apiUrl?: string;
}

export default function NotificationInbox({ walletAddress, apiUrl }: Props) {
  const dispatch = useDispatch();
  const items = useSelector((s: RootState) => s.notifications.items);
  const unreadCount = items.filter((n) => !n.read).length;

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const url = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;

    async function fetchNotifications() {
      try {
        // Fetch notifications for the connected wallet
        const res = await fetch(`${url}/api/notifications/${walletAddress}`);
        if (!res.ok) return; // Silently skip on error — stale data is fine
        const data = await res.json();

        // Each item from the API is dispatched individually;
        // duplicate IDs are deduplicated in the slice reducer
        (data.notifications ?? []).forEach((n: Notification) => dispatch(addNotification(n)));
      } catch {
        // Network failure — keep existing notifications visible
      }
    }

    fetchNotifications(); // Immediate fetch on mount / wallet change
    // Re-poll every POLL_INTERVAL_MS; timer cleared on unmount or wallet change
    const timer = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [walletAddress, url, dispatch]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleItemClick(id: string) {
    // Transition: unread → read
    dispatch(markRead(id));
  }

  function handleClearAll() {
    // Transition: all items removed, unread count resets to 0
    dispatch(clearAllNotifications());
    setOpen(false);
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      >
        {/* Bell icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-5 h-5"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Blue dot — visible only when there are unread notifications */}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        )}
      </button>

      {/* Dropdown — z-index 1100 to sit above all modals */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
          style={{ zIndex: 1100 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </span>
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Items */}
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-800">
            {items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet</li>
            ) : (
              items.map((item) => (
                <li
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-800 ${
                    item.read ? "opacity-60" : "bg-blue-950/20"
                  }`}
                >
                  <span className="text-lg shrink-0">{TYPE_ICON[item.type]}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white leading-snug">{item.message}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(item.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {/* Unread indicator dot */}
                  {!item.read && (
                    <span className="ml-auto mt-1.5 shrink-0 h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
