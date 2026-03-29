"use strict";

/**
 * Unit tests for oracle/registry.js and the refactored oracle/index.js
 *
 * Covers:
 * - Registry is a Map instance after module load
 * - All four built-in slugs are registered on load
 * - registerResolver is exported as a function
 * - Unregistered slug causes markUnresolvable to be called (not UPDATE markets)
 * - Logger warn is called with market ID and slug when a market is dead-lettered
 */

jest.mock("axios");
jest.mock("./medianizer", () => ({
  OracleMedianizer: jest.fn().mockImplementation(() => ({
    aggregate: jest.fn().mockResolvedValue(95000),
  })),
}));

const axios = require("axios");
const { registerResolver, getResolver, getRegistry } = require("./registry");

// Reset registry between tests to avoid cross-test pollution
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

// ── registry.js unit tests ────────────────────────────────────────────────────

describe("registry.js", () => {
  let reg;
  beforeEach(() => {
    reg = require("./registry");
  });

  it("getRegistry() returns a Map instance", () => {
    expect(reg.getRegistry()).toBeInstanceOf(Map);
  });

  it("registerResolver stores a resolver retrievable by getResolver", () => {
    const fn = jest.fn();
    reg.registerResolver("test-slug", fn);
    expect(reg.getResolver("test-slug")).toBe(fn);
  });

  it("registerResolver overwrites an existing resolver for the same slug", () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    reg.registerResolver("overwrite-slug", fn1);
    reg.registerResolver("overwrite-slug", fn2);
    expect(reg.getResolver("overwrite-slug")).toBe(fn2);
  });

  it("getResolver returns undefined for an unregistered slug", () => {
    expect(reg.getResolver("not-registered-xyz")).toBeUndefined();
  });

  it("registerResolver throws TypeError when categorySlug is not a string", () => {
    expect(() => reg.registerResolver(123, jest.fn())).toThrow(TypeError);
    expect(() => reg.registerResolver(null, jest.fn())).toThrow(TypeError);
    expect(() => reg.registerResolver(undefined, jest.fn())).toThrow(TypeError);
    expect(() => reg.registerResolver({}, jest.fn())).toThrow(TypeError);
  });

  it("registerResolver TypeError message includes the actual type", () => {
    expect(() => reg.registerResolver(42, jest.fn())).toThrow(
      "categorySlug must be a string, got number"
    );
  });

  it("registerResolver throws TypeError when resolverFn is not a function", () => {
    expect(() => reg.registerResolver("slug", "not-a-fn")).toThrow(TypeError);
    expect(() => reg.registerResolver("slug", 42)).toThrow(TypeError);
    expect(() => reg.registerResolver("slug", null)).toThrow(TypeError);
  });

  it("registerResolver TypeError message includes the actual type for resolverFn", () => {
    expect(() => reg.registerResolver("slug", "string")).toThrow(
      "resolverFn must be a function, got string"
    );
  });
});

// ── oracle/index.js integration tests ────────────────────────────────────────

describe("oracle/index.js — registry integration", () => {
  let oracle;
  beforeEach(() => {
    jest.resetModules();
    oracle = require("./index");
    oracle._resetState();
    jest.clearAllMocks();
  });

  it("registerResolver is exported from oracle/index.js", () => {
    expect(typeof oracle.registerResolver).toBe("function");
  });

  it("built-in slug 'crypto' is registered on module load", () => {
    const { getRegistry } = require("./registry");
    expect(getRegistry().has("crypto")).toBe(true);
  });

  it("built-in slug 'economics' is registered on module load", () => {
    const { getRegistry } = require("./registry");
    expect(getRegistry().has("economics")).toBe(true);
  });

  it("built-in slug 'sports' is registered on module load", () => {
    const { getRegistry } = require("./registry");
    expect(getRegistry().has("sports")).toBe(true);
  });

  it("built-in slug 'football' is registered on module load", () => {
    const { getRegistry } = require("./registry");
    expect(getRegistry().has("football")).toBe(true);
  });

  it("fetchOutcome resolves crypto market using registered resolver", async () => {
    const market = {
      id: 1,
      question: "BTC above 100k?",
      category_slug: "crypto",
      outcomes: ["Yes", "No"],
    };
    const result = await oracle.fetchOutcome(market);
    expect(typeof result).toBe("number");
  });

  it("fetchOutcome throws descriptive error for unregistered category slug", async () => {
    const market = {
      id: 2,
      question: "Who wins the election?",
      category_slug: "elections",
      outcomes: ["Candidate A", "Candidate B"],
    };
    await expect(oracle.fetchOutcome(market)).rejects.toThrow(
      'No resolver registered for category: "elections"'
    );
  });

  it("fetchOutcome falls back to market.category when category_slug is absent", async () => {
    const market = {
      id: 3,
      question: "BTC above 100k?",
      category_slug: null,
      category: "crypto",
      outcomes: ["Yes", "No"],
    };
    const result = await oracle.fetchOutcome(market);
    expect(typeof result).toBe("number");
  });

  it("resolveMarket calls markUnresolvable (not resolve endpoint) for unregistered slug", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    const market = {
      id: 99,
      question: "Weather tomorrow?",
      category_slug: "weather",
      outcomes: ["Sunny", "Rainy"],
    };

    await oracle.resolveMarket(market);

    // Should call pending-review, NOT the resolve endpoint
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/pending-review"),
      expect.objectContaining({ market_id: 99 })
    );
    expect(axios.post).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/markets/99/resolve"),
      expect.anything()
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("resolveMarket logs warning with market ID and slug for unregistered category", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    const market = {
      id: 77,
      question: "Will it rain?",
      category_slug: "weather",
      outcomes: ["Yes", "No"],
    };

    await oracle.resolveMarket(market);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("77"),
      expect.stringContaining("pending review")
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("dynamically registered resolver is used by fetchOutcome", async () => {
    const mockResolver = jest.fn().mockResolvedValue(1);
    oracle.registerResolver("elections", mockResolver);

    const market = {
      id: 5,
      question: "Who wins?",
      category_slug: "elections",
      outcomes: ["A", "B"],
    };

    const result = await oracle.fetchOutcome(market);
    expect(mockResolver).toHaveBeenCalledWith(market);
    expect(result).toBe(1);
  });
});
