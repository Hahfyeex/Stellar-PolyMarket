import {
  formatWallet,
  formatRelativeTime,
  mapActivityItem,
  ActivityItem,
} from "../useRecentActivity";

// ── formatWallet ──────────────────────────────────────────────────────────────

describe("formatWallet", () => {
  it("truncates a full Stellar address to first 4 + last 3", () => {
    expect(formatWallet("GBXYZ1234ABCDEFGH")).toBe("GBXY...FGH");
  });

  it("returns short strings unchanged", () => {
    expect(formatWallet("ABCD")).toBe("ABCD");
  });

  it("handles empty string", () => {
    expect(formatWallet("")).toBe("");
  });

  it("handles exactly 8 chars", () => {
    expect(formatWallet("ABCD1234")).toBe("ABCD...234");
  });

  it("uses '...' separator (not ellipsis char)", () => {
    const result = formatWallet("GABCDEFGHIJKLMNOP");
    expect(result).toContain("...");
    expect(result).not.toContain("…");
  });
});

// ── formatRelativeTime ────────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  const now = Date.now();

  it("returns 'just now' for < 5 seconds", () => {
    expect(formatRelativeTime(new Date(now - 2000).toISOString())).toBe("just now");
  });

  it("returns seconds for 5–59 seconds", () => {
    expect(formatRelativeTime(new Date(now - 30000).toISOString())).toBe("30s ago");
  });

  it("returns minutes for 60s–3599s", () => {
    expect(formatRelativeTime(new Date(now - 120000).toISOString())).toBe("2m ago");
  });

  it("returns hours for 1h–23h", () => {
    expect(formatRelativeTime(new Date(now - 7200000).toISOString())).toBe("2h ago");
  });

  it("returns a date string for > 24h", () => {
    const old = new Date(now - 86400000 * 2).toISOString();
    const result = formatRelativeTime(old);
    // Should be a locale date string, not a relative label
    expect(result).not.toMatch(/ago/);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── mapActivityItem ───────────────────────────────────────────────────────────

const RAW: ActivityItem = {
  id: 42,
  wallet_address: "GBXYZ1234ABCDEFGH",
  outcome_index: 1,
  amount: "150.5",
  created_at: new Date().toISOString(),
  question: "Will BTC hit $100k?",
  outcomes: ["Yes", "No"],
};

describe("mapActivityItem", () => {
  it("formats amount to 2 decimal places", () => {
    expect(mapActivityItem(RAW).amount).toBe("150.50");
  });

  it("preserves all other fields", () => {
    const mapped = mapActivityItem(RAW);
    expect(mapped.id).toBe(42);
    expect(mapped.wallet_address).toBe(RAW.wallet_address);
    expect(mapped.outcome_index).toBe(1);
    expect(mapped.question).toBe(RAW.question);
  });

  it("keeps outcomes array intact", () => {
    expect(mapActivityItem(RAW).outcomes).toEqual(["Yes", "No"]);
  });

  it("handles non-array outcomes gracefully", () => {
    const bad = { ...RAW, outcomes: null as any };
    expect(mapActivityItem(bad).outcomes).toEqual([]);
  });

  it("formats integer amounts with decimals", () => {
    expect(mapActivityItem({ ...RAW, amount: "200" }).amount).toBe("200.00");
  });

  it("handles very small amounts", () => {
    expect(mapActivityItem({ ...RAW, amount: "0.001" }).amount).toBe("0.00");
  });

  it("handles large amounts", () => {
    expect(mapActivityItem({ ...RAW, amount: "99999.999" }).amount).toBe("100000.00");
  });
});
