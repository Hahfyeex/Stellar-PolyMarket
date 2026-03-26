/**
 * i18nUtils.ts
 *
 * Pure utility functions for i18n locale detection and language persistence.
 * Kept separate from the i18next config so they can be unit-tested in isolation
 * without needing to initialise the full i18next instance.
 */

/** Supported language codes — matches the /public/locales directory names. */
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'yo', 'ha', 'sw'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Human-readable names shown in the language selector dropdown. */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'Français',
  yo: 'Yorùbá',
  ha: 'Hausa',
  sw: 'Swahili',
};

/** localStorage key used to persist the user's chosen language. */
export const STORAGE_KEY = 'stella_lang';

/** Language to fall back to when no match is found. */
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

/**
 * Maps a raw browser locale string (e.g. 'fr-FR', 'yo-NG', 'en-US') to one
 * of the supported language codes.
 *
 * Resolution order:
 *  1. Exact match after lower-casing (e.g. 'fr' → 'fr').
 *  2. Language-prefix match (e.g. 'fr-FR' → 'fr', 'yo-NG' → 'yo').
 *  3. Falls back to FALLBACK_LANGUAGE if nothing matches.
 */
export function mapBrowserLocaleToSupported(locale: string): SupportedLanguage {
  if (!locale) return FALLBACK_LANGUAGE;

  const normalized = locale.toLowerCase();

  // 1. Exact match
  if (SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage;
  }

  // 2. Prefix match (take the part before the first '-')
  const prefix = normalized.split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(prefix as SupportedLanguage)) {
    return prefix as SupportedLanguage;
  }

  return FALLBACK_LANGUAGE;
}

/**
 * Determines the initial language for the app.
 *
 * Priority (highest → lowest):
 *  1. Value stored in localStorage under STORAGE_KEY — honours a previous
 *     explicit user selection.
 *  2. navigator.language — respects the browser's configured locale on first
 *     visit, mapped to the nearest supported language.
 *  3. FALLBACK_LANGUAGE ('en').
 *
 * Returns FALLBACK_LANGUAGE when called in a non-browser environment (SSR).
 */
export function detectInitialLanguage(): SupportedLanguage {
  /* istanbul ignore next — SSR guard: window is undefined only on the server */
  if (typeof window === 'undefined') return FALLBACK_LANGUAGE;

  // 1. Persisted user selection
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
    return stored as SupportedLanguage;
  }

  // 2. Browser locale
  if (navigator?.language) {
    return mapBrowserLocaleToSupported(navigator.language);
  }

  return FALLBACK_LANGUAGE;
}

/**
 * Persists the selected language to localStorage so it is restored on the
 * next visit.  No-ops in a non-browser environment.
 */
export function persistLanguage(lang: SupportedLanguage): void {
  /* istanbul ignore next — SSR guard: window is undefined only on the server */
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, lang);
}
