"use client";

import { useEffect, useState } from "react";
import { messaging, getToken, onMessage } from "../lib/firebase";

interface Props {
  walletAddress: string | null;
}

export default function NotificationManager({ walletAddress }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }

    try {
      const status = await Notification.requestPermission();
      setPermission(status);
      
      if (status === "granted" && messaging) {
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });

        if (currentToken) {
          setToken(currentToken);
          await registerToken(currentToken);
        } else {
          console.warn("No registration token available. Request permission to generate one.");
        }
      }
    } catch (err) {
      console.error("An error occurred while retrieving token. ", err);
    }
  };

  const registerToken = async (fcmToken: string) => {
    try {
      const response = await fetch("http://localhost:4000/api/notifications/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          fcmToken,
          preferences: { market_proposed: true, market_resolved: true },
        }),
      });
      const data = await response.json();
      console.log("Token registered:", data);
    } catch (err) {
      console.error("Failed to register token on backend:", err);
    }
  };

  // Listen for foreground messages
  useEffect(() => {
    if (messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log("Message received in foreground: ", payload);
        // You could trigger a custom toast notification here
        if (payload.notification) {
          new Notification(payload.notification.title || "Market Update", {
            body: payload.notification.body,
          });
        }
      });
      return () => unsubscribe();
    }
  }, []);

  if (!walletAddress) return null;

  return (
    <div className="bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10 mt-6 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Push Notifications</h3>
          <p className="text-sm text-gray-400">
            Get alerts for markets you've bet on (Proposed/Resolved).
          </p>
        </div>
        {permission !== "granted" ? (
          <button
            onClick={requestPermission}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:scale-105 transition-transform"
          >
            Enable Alerts
          </button>
        ) : (
          <div className="flex items-center text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
            Active
          </div>
        )}
      </div>
      {token && (
        <div className="mt-2 text-[10px] text-gray-500 truncate max-w-full">
          Token: {token}
        </div>
      )}
    </div>
  );
}
