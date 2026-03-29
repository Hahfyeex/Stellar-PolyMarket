"use client";
/**
 * I18nProvider — initialises i18next once on the client and wraps the tree
 * with react-i18next's I18nextProvider so every component can call useTranslation.
 *
 * Rendered as a client component because i18next-http-backend and
 * i18next-browser-languagedetector both require browser APIs (fetch, localStorage,
 * navigator). Server components simply render children without translation context.
 */
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { initI18n } from "../lib/i18n";

interface Props {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: Props) {
  // Track whether i18next has finished loading the first language file
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // initI18n is idempotent — safe to call on re-renders
    initI18n().then(() => setReady(true));
  }, []);

  // Render children immediately so layout does not shift;
  // strings will update once the language JSON resolves.
  return (
    <I18nextProvider i18n={i18n} defaultNS="common">
      {children}
    </I18nextProvider>
  );
}
