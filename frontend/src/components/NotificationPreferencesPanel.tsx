"use client";
/**
 * NotificationPreferences
 *
 * UI panel for managing push notification preferences.
 * Shown in the user's profile settings.
 * Integrates with usePushNotifications for FCM token registration.
 */
import { usePushNotifications, NotificationPreferences } from "../hooks/usePushNotifications";

interface Props {
  walletAddress: string | null;
}

const PREF_LABELS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  {
    key: "market_resolved",
    label: "Market Resolved",
    description: "When a market you bet on is resolved",
  },
  {
    key: "payout_available",
    label: "Payout Available",
    description: "When your winnings are ready to claim",
  },
  {
    key: "market_ending_soon",
    label: "Market Ending Soon",
    description: "1 hour before a market you joined closes",
  },
];

export default function NotificationPreferencesPanel({ walletAddress }: Props) {
  const { permission, preferences, requestPermission, updatePreference } =
    usePushNotifications(walletAddress);

  if (!walletAddress) return null;

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">Push Notifications</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Get browser alerts for important market events.
          </p>
        </div>
        {permission !== "granted" ? (
          <button
            onClick={requestPermission}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Enable
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-green-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Active
          </span>
        )}
      </div>

      {permission === "denied" && (
        <p className="text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2">
          Notifications are blocked. Enable them in your browser settings.
        </p>
      )}

      {permission === "granted" && (
        <ul className="space-y-3">
          {PREF_LABELS.map(({ key, label, description }) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-gray-200 text-sm font-medium">{label}</p>
                <p className="text-gray-500 text-xs">{description}</p>
              </div>
              <button
                role="switch"
                aria-checked={preferences[key]}
                onClick={() => updatePreference(key, !preferences[key])}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                  preferences[key] ? "bg-indigo-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    preferences[key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
