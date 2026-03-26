/**
 * jest-i18n-setup.ts
 *
 * Global jest setup for react-i18next. Mocks the translation hook so existing
 * component tests do not require a real i18next instance or HTTP backend.
 *
 * The `t` function returns the translation key with any interpolation params
 * substituted in, e.g. t('bettingSlip.betsQueued', { count: 2, max: 5 })
 * → 'bettingSlip.betsQueued' (keys are stable and assertion-friendly).
 */

import React from "react";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Return the key so existing snapshot/text assertions still pass.
    // Interpolation params are substituted for readability in test output.
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options === "object") {
        return Object.entries(options).reduce(
          (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v)),
          key
        );
      }
      return key;
    },
    i18n: {
      language: "en",
      changeLanguage: jest.fn().mockResolvedValue(undefined),
    },
  }),
  // Allow <I18nextProvider> to passthrough children without a real i18n instance
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));
