"use client";
/**
 * ThemeToggle
 *
 * Accessible button that switches between dark and light themes.
 * Uses the useTheme hook for state management and localStorage persistence.
 *
 * Renders a sun icon in dark mode (click → switch to light)
 * and a moon icon in light mode (click → switch to dark).
 */
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";

interface Props {
  /** Additional Tailwind classes for positioning/sizing */
  className?: string;
}

export default function ThemeToggle({ className = "" }: Props) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation("common");

  const label = theme === "dark" ? t("theme.switch_to_light") : t("theme.switch_to_dark");

  return (
    <button
      onClick={toggleTheme}
      data-testid="theme-toggle"
      aria-label={label}
      title={label}
      className={`
        w-9 h-9 rounded-lg flex items-center justify-center
        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
        bg-transparent hover:bg-[var(--bg-elevated)]
        border border-transparent hover:border-[var(--border-default)]
        transition-colors duration-150
        ${className}
      `}
    >
      {theme === "dark" ? (
        /* Sun icon — shown in dark mode, click to go light */
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1"  x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1"  y1="12" x2="3"  y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        /* Moon icon — shown in light mode, click to go dark */
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}
