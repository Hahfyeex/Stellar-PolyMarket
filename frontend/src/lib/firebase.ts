import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, Analytics, logEvent } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Messaging
let messaging: Messaging | null = null;
if (typeof window !== "undefined") {
  messaging = getMessaging(app);
}

// Initialize Analytics with privacy compliance
let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// Generate anonymous session ID for privacy compliance
const generateSessionId = (): string => {
  const stored = sessionStorage.getItem('analytics_session_id');
  if (stored) return stored;
  
  const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  sessionStorage.setItem('analytics_session_id', sessionId);
  return sessionId;
};

// Analytics wrapper with privacy compliance
export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (!analytics) return;
  
  // Add anonymous session ID to all events for user identification without PII
  const enhancedParams: Record<string, any> = {
    ...parameters,
    session_id: generateSessionId(),
    timestamp: new Date().toISOString(),
  };
  
  // Ensure no wallet addresses or PII are included
  const sanitizedParams: Record<string, any> = {};
  Object.keys(enhancedParams).forEach((key) => {
    const value = enhancedParams[key];
    if (typeof value === 'string' && (value.includes('G') || value.includes('0x') || value.length > 100)) {
      // Skip potential wallet addresses or long strings that might contain PII
      return;
    }
    sanitizedParams[key] = value;
  });
  
  logEvent(analytics, eventName, sanitizedParams);
};

export { app, db, messaging, analytics, getToken, onMessage };
