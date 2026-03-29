/**
 * i18n.test.ts — unit tests for the i18n configuration module
 *
 * Tests cover:
 * - normaliseLocale: locale normalisation and fallback logic (pure function)
 * - SUPPORTED_LOCALES and LANGUAGE_STORAGE_KEY exports (constants)
 * - initI18n: initialisation config options and idempotency
 * - localStorage persistence behaviour via normaliseLocale integration
 *
 * i18next and its plugins are mocked to avoid HTTP requests / DOM requirements.
 */

// ─── Mocks (hoisted by Jest before any imports) ───────────────────────────────

// Shared mock state — accessible across the module + tests via closure
const mockInit = jest.fn().mockResolvedValue(undefined);
const mockUse = jest.fn();

// i18next mock — `.use()` is chainable and returns the same object
const mockI18n: Record<string, unknown> = {
  isInitialized: false,
  language: "en",
  resolvedLanguage: "en",
  init: mockInit,
  changeLanguage: jest.fn().mockResolvedValue(undefined),
};
mockI18n.use = jest.fn().mockReturnValue(mockI18n); // chainable

jest.mock("i18next", () => ({ __esModule: true, default: mockI18n }));
jest.mock("i18next-http-backend", () => ({ __esModule: true, default: class Backend {} }));
jest.mock("i18next-browser-languagedetector", () => ({
  __esModule: true,
  default: class LanguageDetector {},
}));
jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

// ─── Module under test ────────────────────────────────────────────────────────

import {
  normaliseLocale,
  initI18n,
  SUPPORTED_LOCALES,
  LANGUAGE_STORAGE_KEY,
} from "../i18n";

// ─── SUPPORTED_LOCALES ────────────────────────────────────────────────────────

describe("SUPPORTED_LOCALES", () => {
  it("contains all 5 priority languages", () => {
    expect(SUPPORTED_LOCALES).toEqual(
      expect.arrayContaining(["en", "fr", "yo", "ha", "sw"])
    );
  });

  it("has exactly 5 entries", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(5);
  });
});

// ─── LANGUAGE_STORAGE_KEY ─────────────────────────────────────────────────────

describe("LANGUAGE_STORAGE_KEY", () => {
  it('equals "stella_lang"', () => {
    expect(LANGUAGE_STORAGE_KEY).toBe("stella_lang");
  });
});

// ─── normaliseLocale ──────────────────────────────────────────────────────────

describe("normaliseLocale", () => {
  it("returns a bare supported locale unchanged", () => {
    expect(normaliseLocale("en")).toBe("en");
    expect(normaliseLocale("fr")).toBe("fr");
    expect(normaliseLocale("yo")).toBe("yo");
    expect(normaliseLocale("ha")).toBe("ha");
    expect(normaliseLocale("sw")).toBe("sw");
  });

  it("strips region suffix (e.g. en-US → en)", () => {
    expect(normaliseLocale("en-US")).toBe("en");
    expect(normaliseLocale("fr-FR")).toBe("fr");
    expect(normaliseLocale("fr-CA")).toBe("fr");
  });

  it("is case-insensitive (EN → en, FR-FR → fr)", () => {
    expect(normaliseLocale("EN")).toBe("en");
    expect(normaliseLocale("FR-FR")).toBe("fr");
    expect(normaliseLocale("SW")).toBe("sw");
    expect(normaliseLocale("YO")).toBe("yo");
  });

  it('returns "en" for unsupported locales', () => {
    expect(normaliseLocale("de")).toBe("en");
    expect(normaliseLocale("zh-CN")).toBe("en");
    expect(normaliseLocale("pt-BR")).toBe("en");
  });

  it('returns "en" for empty and non-alphabetic strings', () => {
    expect(normaliseLocale("")).toBe("en");
    expect(normaliseLocale("123")).toBe("en");
    expect(normaliseLocale("xyz")).toBe("en");
  });

  it("handles all supported locales with region suffixes", () => {
    expect(normaliseLocale("yo-NG")).toBe("yo");
    expect(normaliseLocale("ha-NG")).toBe("ha");
    expect(normaliseLocale("sw-KE")).toBe("sw");
  });
});

// ─── initI18n ─────────────────────────────────────────────────────────────────

describe("initI18n", () => {
  // Run initI18n once — subsequent tests inspect what was passed to init
  let initOptions: Record<string, unknown>;

  beforeAll(async () => {
    await initI18n();
    initOptions = (mockInit.mock.calls[0] ?? [[]])[0] as Record<string, unknown>;
  });

  it("calls i18n.init exactly once on first invocation", () => {
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — second call does not re-run init", async () => {
    await initI18n();
    expect(mockInit).toHaveBeenCalledTimes(1); // still 1
  });

  it("returns the i18n singleton", async () => {
    const result = await initI18n();
    // Should be the same object as the mocked default export
    expect(result).toBe(mockI18n);
  });

  it("chains .use() at least 3 times (Backend, LanguageDetector, initReactI18next)", () => {
    expect((mockI18n.use as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("sets fallbackLng to 'en'", () => {
    expect(initOptions.fallbackLng).toBe("en");
  });

  it("sets defaultNS to 'common'", () => {
    expect(initOptions.defaultNS).toBe("common");
  });

  it("includes 'common' in the ns array", () => {
    expect(initOptions.ns).toContain("common");
  });

  it("configures backend loadPath with {{lng}} and {{ns}} placeholders", () => {
    const backend = initOptions.backend as Record<string, string>;
    expect(backend.loadPath).toMatch(/\{\{lng\}\}/);
    expect(backend.loadPath).toMatch(/\{\{ns\}\}/);
  });

  it("backend loadPath points to /locales/", () => {
    const backend = initOptions.backend as Record<string, string>;
    expect(backend.loadPath).toMatch(/\/locales\//);
  });

  it("configures detection to check localStorage before navigator", () => {
    const detection = initOptions.detection as Record<string, unknown>;
    const order = detection.order as string[];
    expect(order[0]).toBe("localStorage");
    expect(order).toContain("navigator");
  });

  it("uses LANGUAGE_STORAGE_KEY ('stella_lang') as the localStorage lookup key", () => {
    const detection = initOptions.detection as Record<string, unknown>;
    expect(detection.lookupLocalStorage).toBe("stella_lang");
  });

  it("caches the detected language to localStorage only (not cookies)", () => {
    const detection = initOptions.detection as Record<string, unknown>;
    expect(detection.caches).toEqual(["localStorage"]);
  });

  it("wires normaliseLocale as the convertDetectedLanguage transformer", () => {
    const detection = initOptions.detection as Record<string, unknown>;
    // Should be the exact function exported from the module
    expect(detection.convertDetectedLanguage).toBe(normaliseLocale);
  });

  it("disables HTML escaping (React handles XSS via virtual DOM)", () => {
    const interpolation = initOptions.interpolation as Record<string, unknown>;
    expect(interpolation.escapeValue).toBe(false);
  });
});

// ─── normaliseLocale × localStorage persistence ───────────────────────────────
// These tests verify the detection pipeline end-to-end using normaliseLocale
// as a pure proxy for the storage round-trip (no real localStorage required).

describe("locale detection pipeline (normaliseLocale integration)", () => {
  it("handles a value as it would be stored in localStorage verbatim", () => {
    // Simulates: localStorage.getItem("stella_lang") === "fr"
    expect(normaliseLocale("fr")).toBe("fr");
  });

  it("handles a locale tag that navigator.language might return (yo-NG)", () => {
    // Simulates: navigator.language === "yo-NG"
    expect(normaliseLocale("yo-NG")).toBe("yo");
  });

  it("falls back to 'en' when localStorage holds an unsupported locale ('de')", () => {
    // Simulates: localStorage.getItem("stella_lang") === "de"
    expect(normaliseLocale("de")).toBe("en");
  });

  it("falls back to 'en' when no stored value is present (empty string)", () => {
    // Simulates: localStorage.getItem("stella_lang") returns null → coerced to ""
    expect(normaliseLocale("")).toBe("en");
  });

  it("Hausa locale from navigator (ha-NG) normalises correctly", () => {
    expect(normaliseLocale("ha-NG")).toBe("ha");
  });

  it("Swahili locale from navigator (sw-KE) normalises correctly", () => {
    expect(normaliseLocale("sw-KE")).toBe("sw");
  });
});
