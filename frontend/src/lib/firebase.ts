import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore } from "firebase/firestore";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
} from "firebase/app-check";

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

// ---------------------------------------------------------------------------
// Firebase App Check
// Prevents unauthorized clients (bots, scrapers, curl) from calling your
// Cloud Functions or reading Firestore.
//
// In production  → reCAPTCHA Enterprise provider (requires a site key from
//                  the Google Cloud Console).
// In development → App Check debug token so local dev still works without
//                  a real reCAPTCHA challenge.  Set
//                    NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=<token>
//                  in your .env.local (never commit this value).
// ---------------------------------------------------------------------------
if (typeof window !== "undefined") {
  const isDebug =
    process.env.NODE_ENV !== "production" &&
    Boolean(process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN);

  if (isDebug) {
    // Expose the debug token so the Firebase SDK can pick it up.
    // Must be set BEFORE initializeAppCheck is called.
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
      process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
  }

  const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY;

  if (!recaptchaKey && !isDebug) {
    console.error(
      "[AppCheck] NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY is not set. " +
        "App Check will not be enforced in this environment."
    );
  } else {
    initializeAppCheck(app, {
      provider: recaptchaKey
        ? new ReCaptchaEnterpriseProvider(recaptchaKey)
        : // Fallback: debug-only custom provider (never reaches production
          // because isDebug guard above catches it first)
          new CustomProvider({
            getToken: async () => ({
              token: process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN ?? "",
              expireTimeMillis: Date.now() + 3_600_000,
            }),
          }),
      // isTokenAutoRefreshEnabled: keep tokens fresh without manual calls
      isTokenAutoRefreshEnabled: true,
    });
  }
}

// Initialize Firestore
const db = getFirestore(app);

// Initialize Messaging (browser only)
let messaging = null;
if (typeof window !== "undefined") {
  messaging = getMessaging(app);
}

export { app, db, messaging, getToken, onMessage };
