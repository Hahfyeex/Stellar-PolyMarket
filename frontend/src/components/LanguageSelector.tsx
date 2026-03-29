"use client";
/**
 * LanguageSelector — dropdown that lets the user switch between the 5 supported
 * locales. The selection is persisted to localStorage under the "stella_lang" key
 * (handled automatically by i18next-browser-languagedetector's caching config).
 *
 * Supported locales: English, Français, Yorùbá, Hausa, Kiswahili
 */
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../lib/i18n";

interface Props {
  /** Additional Tailwind classes for positioning */
  className?: string;
}

export default function LanguageSelector({ className = "" }: Props) {
  const { t, i18n } = useTranslation("common");

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // i18n.changeLanguage writes the new value to localStorage automatically
    // (via the caches: ["localStorage"] detection config) and triggers a re-render
    i18n.changeLanguage(e.target.value as SupportedLocale);
  };

  return (
    <select
      value={i18n.resolvedLanguage ?? i18n.language}
      onChange={handleChange}
      aria-label={t("language.selector_label")}
      className={`
        bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5
        border border-gray-700 outline-none
        hover:border-gray-500 focus:border-blue-500
        transition-colors cursor-pointer
        ${className}
      `}
    >
      {/* Render one <option> per supported locale using the translated locale name */}
      {SUPPORTED_LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {t(`language.${locale}`)}
        </option>
      ))}
    </select>
  );
}
