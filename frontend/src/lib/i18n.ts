/**
 * i18n.ts — i18next configuration for Stella Polymarket
 *
 * Architecture:
 * - i18next-http-backend: dynamically loads only the active language's JSON from
 *   /public/locales/[lang]/common.json (no upfront bundle cost for unused locales)
 * - i18next-browser-languagedetector: reads localStorage key "stella_lang" first,
 *   then falls back to navigator.language so browser locale is honoured on first visit
 * - react-i18next: provides the useTranslation hook used by all components
 *
 * Namespace: "common" — all UI strings live in a single namespace for simplicity.
 * Add additional namespaces (e.g. "errors") as the app grows.
 *
 * Supported locales: en, fr, yo (Yoruba), ha (Hausa), sw (Swahili)
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

/** All locales the app ships translations for */
export const SUPPORTED_LOCALES = ["en", "fr", "yo", "ha", "sw"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** localStorage key used to persist the user's chosen language */
export const LANGUAGE_STORAGE_KEY = "stella_lang";

/**
 * Normalises a raw browser/detector locale string (e.g. "fr-FR", "en-US")
 * to one of our supported locale codes. Returns "en" if no match is found.
 */
export function normaliseLocale(raw: string): SupportedLocale {
  const base = raw.split("-")[0].toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : "en";
}

let initialised = false;

/**
 * Initialises i18next once. Safe to call multiple times — subsequent calls are
 * no-ops so the function can be invoked from both the provider and unit tests.
 */
export async function initI18n(): Promise<typeof i18n> {
  if (initialised || i18n.isInitialized) {
    initialised = true;
    return i18n;
  }

  await i18n
    // Load translation JSON files on demand from /public/locales/[lang]/[ns].json
    .use(Backend)
    // Detect language from localStorage ("stella_lang") then navigator.language
    .use(LanguageDetector)
    // Wire i18next into React's hook system
    .use(initReactI18next)
    .init({
      // Fallback when a key is missing in the active language
      fallbackLng: "en",

      // Active namespace used by all components
      defaultNS: "common",
      ns: ["common"],

      // Do not escape HTML — React handles XSS via its virtual DOM
      interpolation: { escapeValue: false },

      // Backend: points to /public/locales/{{lng}}/{{ns}}.json
      backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json",
      },

      // Language detection order:
      //   1. localStorage (key: stella_lang) — persisted user choice
      //   2. navigator.language — browser/OS locale on first visit
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        // Only cache to localStorage; cookies are not used
        caches: ["localStorage"],
        // Normalise detected language to strip region suffixes (e.g. en-US → en)
        convertDetectedLanguage: normaliseLocale,
      },

      // Show key name (not blank) while the language file is loading
      saveMissing: false,
    });

  initialised = true;
  return i18n;
}

export default i18n;
