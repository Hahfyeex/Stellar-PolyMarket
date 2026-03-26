"use client";
/**
 * I18nProvider
 *
 * Client-side wrapper that initialises i18next (which requires browser APIs)
 * and supplies the i18next instance to all child components via
 * react-i18next's I18nextProvider.
 *
 * The <Suspense> boundary is required because i18next-http-backend fetches
 * translation files asynchronously. Components that call useTranslation()
 * will suspend until their locale JSON is loaded; the fallback prop can be
 * replaced with a full-page skeleton if desired.
 */
import { Suspense } from "react";
import { I18nextProvider } from "react-i18next";
// Importing this module triggers the client-side i18next initialisation.
import i18n from "../lib/i18n";

interface Props {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: Props) {
  return (
    <I18nextProvider i18n={i18n}>
      {/* Suspense is required for useSuspense:true — shows nothing while
          the first locale JSON is being fetched from /public/locales. */}
      <Suspense fallback={null}>{children}</Suspense>
    </I18nextProvider>
  );
}
