"use client";
/**
 * usePushNotifications
 *
 * Handles FCM token registration, permission flow, foreground message
 * handling, and notification preference management.
 *
 * Usage:
 *   const { permission, preferences, requestPermission, updatePreference } =
 *     usePushNotifications(walletAddress);
 */
import { useEffect, useState, useCallback } from "react";
import { messaging, getToken, onMessage } from "../lib/firebase";

export interface NotificationPreferences {
  market_resolved: boolean;
  payout_available: boolean;
  market_ending_soon: boolean;
}

const PREFS_KEY = "stella_notif_prefs";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

const DEFAULT_PREFS: NotificationPreferences = {
  market_resolved: true,
  payout_available: true,
  market_ending_soon: true,
};

function loadPrefs(): NotificationPreferences {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(PREFS_KEY) : null;
    return raw ? (JSON.parse(raw) as NotificationPreferences) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // quota exceeded — ignore
  }
}

export function usePushNotifications(walletAddress: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(loadPrefs);

  // Sync permission state on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Register FCM token with backend
  const registerToken = useCallback(
    async (token: string, prefs: NotificationPreferences) => {
      if (!walletAddress) return;
      try {
        await fetch(`${API_URL}/api/notifications/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress, fcmToken: token, preferences: prefs }),
        });
      } catch (err) {
        console.error("[FCM] Failed to register token:", err);
      }
    },
    [walletAddress]
  );

  // Request browser permission and obtain FCM token
  const requestPermission = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const status = await Notification.requestPermission();
      setPermission(status);
      if (status === "granted" && messaging) {
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token) {
          setFcmToken(token);
          await registerToken(token, preferences);
        }
      }
    } catch (err) {
      console.error("[FCM] Permission request failed:", err);
    }
  }, [walletAddress, preferences, registerToken]);

  // Update a single preference and sync to backend
  const updatePreference = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      const updated = { ...preferences, [key]: value };
      setPreferences(updated);
      savePrefs(updated);
      if (fcmToken) await registerToken(fcmToken, updated);
    },
    [preferences, fcmToken, registerToken]
  );

  // Listen for foreground FCM messages
  useEffect(() => {
    if (!messaging) return;
    const unsub = onMessage(messaging, (payload) => {
      const { title = "Stella Polymarket", body = "" } = payload.notification ?? {};
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    });
    return unsub;
  }, []);

  return { permission, fcmToken, preferences, requestPermission, updatePreference };
}
