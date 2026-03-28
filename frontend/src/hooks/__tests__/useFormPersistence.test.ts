/**
 * Unit tests for useFormPersistence utilities
 * Covers: storageKey, readPersistedForm, writePersistedForm, clearPersistedForm, useFormPersistence hook
 */
import {
  storageKey,
  readPersistedForm,
  writePersistedForm,
  clearPersistedForm,
  PersistedBetForm,
} from "../useFormPersistence";

// ── storageKey ────────────────────────────────────────────────────────────────

describe("storageKey", () => {
  it("returns correct key format", () => {
    expect(storageKey(42)).toBe("stella_bet_form_42");
  });

  it("uses market id in the key", () => {
    expect(storageKey(1)).toBe("stella_bet_form_1");
    expect(storageKey(999)).toBe("stella_bet_form_999");
  });

  it("different markets produce different keys", () => {
    expect(storageKey(1)).not.toBe(storageKey(2));
  });
});

// ── readPersistedForm ─────────────────────────────────────────────────────────

describe("readPersistedForm", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is stored", () => {
    expect(readPersistedForm(1)).toBeNull();
  });

  it("returns parsed form data when stored", () => {
    const form: PersistedBetForm = { outcomeIndex: 1, amount: "50", slippageTolerance: 0.5 };
    localStorage.setItem(storageKey(1), JSON.stringify(form));
    expect(readPersistedForm(1)).toEqual(form);
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem(storageKey(1), "not-json{{");
    expect(readPersistedForm(1)).toBeNull();
  });

  it("reads independently per market id", () => {
    const form1: PersistedBetForm = { outcomeIndex: 0, amount: "10", slippageTolerance: 0.1 };
    const form2: PersistedBetForm = { outcomeIndex: 1, amount: "99", slippageTolerance: 2 };
    localStorage.setItem(storageKey(1), JSON.stringify(form1));
    localStorage.setItem(storageKey(2), JSON.stringify(form2));
    expect(readPersistedForm(1)).toEqual(form1);
    expect(readPersistedForm(2)).toEqual(form2);
  });
});

// ── writePersistedForm ────────────────────────────────────────────────────────

describe("writePersistedForm", () => {
  beforeEach(() => localStorage.clear());

  it("writes form data to localStorage", () => {
    const form: PersistedBetForm = { outcomeIndex: 0, amount: "25", slippageTolerance: 1 };
    writePersistedForm(5, form);
    const raw = localStorage.getItem(storageKey(5));
    expect(JSON.parse(raw!)).toEqual(form);
  });

  it("overwrites existing data", () => {
    const form1: PersistedBetForm = { outcomeIndex: 0, amount: "10", slippageTolerance: 0.5 };
    const form2: PersistedBetForm = { outcomeIndex: 1, amount: "99", slippageTolerance: 2 };
    writePersistedForm(5, form1);
    writePersistedForm(5, form2);
    expect(readPersistedForm(5)).toEqual(form2);
  });

  it("writes independently per market id", () => {
    const form1: PersistedBetForm = { outcomeIndex: 0, amount: "10", slippageTolerance: 0.5 };
    const form2: PersistedBetForm = { outcomeIndex: 1, amount: "50", slippageTolerance: 1 };
    writePersistedForm(1, form1);
    writePersistedForm(2, form2);
    expect(readPersistedForm(1)).toEqual(form1);
    expect(readPersistedForm(2)).toEqual(form2);
  });

  it("persists null outcomeIndex correctly", () => {
    const form: PersistedBetForm = { outcomeIndex: null, amount: "", slippageTolerance: 0.5 };
    writePersistedForm(3, form);
    expect(readPersistedForm(3)).toEqual(form);
  });
});

// ── clearPersistedForm ────────────────────────────────────────────────────────

describe("clearPersistedForm", () => {
  beforeEach(() => localStorage.clear());

  it("removes the key from localStorage", () => {
    const form: PersistedBetForm = { outcomeIndex: 0, amount: "10", slippageTolerance: 0.5 };
    writePersistedForm(7, form);
    clearPersistedForm(7);
    expect(localStorage.getItem(storageKey(7))).toBeNull();
  });

  it("does not throw when key does not exist", () => {
    expect(() => clearPersistedForm(999)).not.toThrow();
  });

  it("only removes the specified market key", () => {
    const form: PersistedBetForm = { outcomeIndex: 0, amount: "10", slippageTolerance: 0.5 };
    writePersistedForm(1, form);
    writePersistedForm(2, form);
    clearPersistedForm(1);
    expect(readPersistedForm(1)).toBeNull();
    expect(readPersistedForm(2)).toEqual(form);
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe("write → read → clear round-trip", () => {
  beforeEach(() => localStorage.clear());

  it("persists and restores all three fields", () => {
    const form: PersistedBetForm = { outcomeIndex: 1, amount: "123.45", slippageTolerance: 2 };
    writePersistedForm(10, form);
    const restored = readPersistedForm(10);
    expect(restored?.outcomeIndex).toBe(1);
    expect(restored?.amount).toBe("123.45");
    expect(restored?.slippageTolerance).toBe(2);
  });

  it("returns null after clear", () => {
    const form: PersistedBetForm = { outcomeIndex: 0, amount: "50", slippageTolerance: 0.5 };
    writePersistedForm(10, form);
    clearPersistedForm(10);
    expect(readPersistedForm(10)).toBeNull();
  });
});
