/**
 * @jest-environment jsdom
 */
/**
 * i18nUtils.test.ts
 *
 * Unit tests for the pure i18n utility functions:
 *   - mapBrowserLocaleToSupported()
 *   - detectInitialLanguage()
 *   - persistLanguage()
 *
 * These functions are tested in isolation without initialising the full
 * i18next instance, keeping the suite fast and deterministic.
 * Coverage target: ≥90% lines, functions, branches.
 */

import {
  mapBrowserLocaleToSupported,
  detectInitialLanguage,
  persistLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  STORAGE_KEY,
  FALLBACK_LANGUAGE,
  type SupportedLanguage,
} from '../i18nUtils';

// ─── helpers ─────────────────────────────────────────────────────────────────

function setLocalStorage(key: string, value: string) {
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn((k: string) => (k === key ? value : null)),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    },
    writable: true,
  });
}

function setNavigatorLanguage(lang: string) {
  Object.defineProperty(navigator, 'language', {
    value: lang,
    writable: true,
    configurable: true,
  });
}

// ─── SUPPORTED_LANGUAGES constant ────────────────────────────────────────────

describe('SUPPORTED_LANGUAGES', () => {
  it('contains exactly the 5 required languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(5);
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('fr');
    expect(SUPPORTED_LANGUAGES).toContain('yo');
    expect(SUPPORTED_LANGUAGES).toContain('ha');
    expect(SUPPORTED_LANGUAGES).toContain('sw');
  });
});

// ─── LANGUAGE_NAMES constant ─────────────────────────────────────────────────

describe('LANGUAGE_NAMES', () => {
  it('has a display name for every supported language', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_NAMES[lang]).toBeTruthy();
    }
  });

  it('uses the correct human-readable names', () => {
    expect(LANGUAGE_NAMES.en).toBe('English');
    expect(LANGUAGE_NAMES.fr).toBe('Français');
    expect(LANGUAGE_NAMES.yo).toBe('Yorùbá');
    expect(LANGUAGE_NAMES.ha).toBe('Hausa');
    expect(LANGUAGE_NAMES.sw).toBe('Swahili');
  });
});

// ─── STORAGE_KEY constant ─────────────────────────────────────────────────────

describe('STORAGE_KEY', () => {
  it('equals "stella_lang"', () => {
    expect(STORAGE_KEY).toBe('stella_lang');
  });
});

// ─── FALLBACK_LANGUAGE constant ───────────────────────────────────────────────

describe('FALLBACK_LANGUAGE', () => {
  it('is "en"', () => {
    expect(FALLBACK_LANGUAGE).toBe('en');
  });
});

// ─── mapBrowserLocaleToSupported() ───────────────────────────────────────────

describe('mapBrowserLocaleToSupported', () => {
  it.each(SUPPORTED_LANGUAGES)('returns "%s" for exact match "%s"', (lang) => {
    expect(mapBrowserLocaleToSupported(lang)).toBe(lang);
  });

  it('matches "fr-FR" via prefix to "fr"', () => {
    expect(mapBrowserLocaleToSupported('fr-FR')).toBe('fr');
  });

  it('matches "yo-NG" via prefix to "yo"', () => {
    expect(mapBrowserLocaleToSupported('yo-NG')).toBe('yo');
  });

  it('matches "ha-NE" via prefix to "ha"', () => {
    expect(mapBrowserLocaleToSupported('ha-NE')).toBe('ha');
  });

  it('matches "sw-KE" via prefix to "sw"', () => {
    expect(mapBrowserLocaleToSupported('sw-KE')).toBe('sw');
  });

  it('matches "en-US" via prefix to "en"', () => {
    expect(mapBrowserLocaleToSupported('en-US')).toBe('en');
  });

  it('returns fallback "en" for an unsupported locale', () => {
    expect(mapBrowserLocaleToSupported('zh-CN')).toBe('en');
  });

  it('returns fallback "en" for an empty string', () => {
    expect(mapBrowserLocaleToSupported('')).toBe('en');
  });

  it('returns fallback "en" for a completely unknown locale', () => {
    expect(mapBrowserLocaleToSupported('xx')).toBe('en');
  });

  it('is case-insensitive — "FR" maps to "fr"', () => {
    expect(mapBrowserLocaleToSupported('FR')).toBe('fr');
  });

  it('is case-insensitive — "EN-US" maps to "en"', () => {
    expect(mapBrowserLocaleToSupported('EN-US')).toBe('en');
  });
});

// ─── detectInitialLanguage() ─────────────────────────────────────────────────

describe('detectInitialLanguage', () => {
  beforeEach(() => {
    // Reset localStorage mock before each test
    jest.resetAllMocks();
  });

  it('returns the language stored in localStorage when valid', () => {
    setLocalStorage(STORAGE_KEY, 'fr');
    expect(detectInitialLanguage()).toBe('fr');
  });

  it('returns the language stored in localStorage for each supported lang', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      setLocalStorage(STORAGE_KEY, lang);
      expect(detectInitialLanguage()).toBe(lang);
    }
  });

  it('ignores an invalid localStorage value and falls back to navigator', () => {
    setLocalStorage(STORAGE_KEY, 'de'); // not supported
    setNavigatorLanguage('sw');
    expect(detectInitialLanguage()).toBe('sw');
  });

  it('falls back to navigator.language when localStorage is empty', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => null), setItem: jest.fn() },
      writable: true,
    });
    setNavigatorLanguage('yo-NG');
    expect(detectInitialLanguage()).toBe('yo');
  });

  it('falls back to "en" when localStorage is empty and navigator is unsupported', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => null), setItem: jest.fn() },
      writable: true,
    });
    setNavigatorLanguage('zh-TW');
    expect(detectInitialLanguage()).toBe('en');
  });

  it('prefers localStorage over navigator.language', () => {
    setLocalStorage(STORAGE_KEY, 'ha');
    setNavigatorLanguage('fr-FR');
    expect(detectInitialLanguage()).toBe('ha');
  });

  it('returns "en" when localStorage is empty and navigator.language is falsy', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => null), setItem: jest.fn() },
      writable: true,
    });
    // navigator.language set to empty string — treats as falsy path
    setNavigatorLanguage('');
    expect(detectInitialLanguage()).toBe('en');
  });

  it('returns "en" when localStorage is empty and navigator.language is undefined', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => null), setItem: jest.fn() },
      writable: true,
    });
    Object.defineProperty(navigator, 'language', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(detectInitialLanguage()).toBe('en');
  });
});

// ─── SSR guard tests (window === undefined) ───────────────────────────────────

describe('SSR / window undefined', () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalWindow = global.window;
  });

  afterEach(() => {
    // Restore window after each test so other suites are not affected
    global.window = originalWindow;
  });

  it('detectInitialLanguage returns FALLBACK_LANGUAGE when window is undefined', () => {
    // Simulate SSR environment by temporarily removing window
    // @ts-ignore — intentionally removing window for SSR branch coverage
    delete global.window;
    expect(detectInitialLanguage()).toBe(FALLBACK_LANGUAGE);
  });

  it('persistLanguage is a no-op when window is undefined', () => {
    // @ts-ignore
    delete global.window;
    // Should not throw
    expect(() => persistLanguage('fr')).not.toThrow();
  });
});

// ─── persistLanguage() ───────────────────────────────────────────────────────

describe('persistLanguage', () => {
  it('writes the language to localStorage under STORAGE_KEY', () => {
    const setItem = jest.fn();
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(), setItem, removeItem: jest.fn() },
      writable: true,
    });

    persistLanguage('sw');
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, 'sw');
  });

  it.each(SUPPORTED_LANGUAGES)('persists each supported language "%s"', (lang) => {
    const setItem = jest.fn();
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(), setItem, removeItem: jest.fn() },
      writable: true,
    });

    persistLanguage(lang as SupportedLanguage);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, lang);
  });
});
