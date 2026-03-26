/**
 * i18n.ts — i18next configuration for Stella Polymarket
 *
 * Architecture
 * ────────────
 * • i18next-http-backend   — loads translation JSON files *dynamically* from
 *   /public/locales/[lang]/[ns].json so only the active language is fetched.
 * • i18next-browser-languagedetector — auto-detects the user's locale on first
 *   visit using navigator.language, then falls back to localStorage.
 * • react-i18next            — provides the useTranslation() hook used in
 *   every translated component.
 *
 * Namespace structure
 * ───────────────────
 * A single namespace "common" holds all UI strings.  If the project grows,
 * additional namespaces (e.g. "governance", "lp") can be added here and
 * their JSON files placed under /public/locales/[lang]/[ns].json.
 *
 * Language persistence
 * ────────────────────
 * The detector's localStorage cache writes/reads the key "stella_lang".
 * Calling i18n.changeLanguage() automatically updates this key.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE, STORAGE_KEY } from '../utils/i18nUtils';

// Guard: i18next uses browser APIs (localStorage, navigator) — skip on the server.
if (typeof window !== 'undefined' && !i18n.isInitialized) {
  i18n
    // Dynamically loads /public/locales/[lang]/[ns].json — only the active
    // language file is fetched, keeping the initial bundle lean.
    .use(HttpBackend)
    // Detects locale from localStorage → navigator.language → fallback.
    .use(LanguageDetector)
    // Binds i18next to React's context / hook system.
    .use(initReactI18next)
    .init({
      // ── Namespace / key config ────────────────────────────────────────
      // "common" is the single namespace; maps to common.json per locale.
      ns: ['common'],
      defaultNS: 'common',

      // ── Language config ───────────────────────────────────────────────
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],

      // ── Backend config (i18next-http-backend) ─────────────────────────
      // Next.js serves /public/* at the root URL, so the load path below
      // resolves to /locales/en/common.json, /locales/fr/common.json, etc.
      backend: {
        loadPath: '/locales/{{lng}}/{{ns}}.json',
      },

      // ── Detector config (i18next-browser-languagedetector) ────────────
      // Check localStorage first so explicit user selections are honoured;
      // fall through to navigator.language on first visit.
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: STORAGE_KEY,   // key: "stella_lang"
        caches: ['localStorage'],          // persist every change automatically
      },

      // ── React / interpolation ─────────────────────────────────────────
      interpolation: {
        escapeValue: false, // React already handles XSS escaping
      },

      react: {
        // useSuspense: true enables Suspense-based loading so components
        // can rely on translation being ready before first render.
        useSuspense: true,
      },
    });
}

export default i18n;
