"use client";
/**
 * LanguageSelector
 *
 * Dropdown that lets users switch between the five supported locales.
 * On change it calls i18n.changeLanguage() — which internally triggers
 * i18next-http-backend to fetch the new locale JSON if not already cached —
 * and also writes to localStorage via the detector's cache config so the
 * selection persists across sessions (key: "stella_lang").
 */
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from "../utils/i18nUtils";

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();

  // Normalise to base language code in case i18next stores 'en-US' etc.
  const currentLang = (i18n.language?.split("-")[0] ?? "en") as SupportedLanguage;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value as SupportedLanguage;
    // changeLanguage() also updates the localStorage key ("stella_lang")
    // automatically because the detector's caches option includes 'localStorage'.
    i18n.changeLanguage(lang);
  }

  return (
    <select
      value={currentLang}
      onChange={handleChange}
      aria-label={t("language.selectLanguage")}
      className="bg-gray-800 text-gray-300 text-sm border border-gray-600 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {LANGUAGE_NAMES[lang]}
        </option>
      ))}
    </select>
  );
}
