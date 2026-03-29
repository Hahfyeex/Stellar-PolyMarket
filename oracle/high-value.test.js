/**
 * Tests for high-value market two-factor confirmation (oracle side).
 */
jest.mock("axios");
jest.mock("./medianizer", () => ({
  OracleMedianizer: jest.fn().mockImplementation(() => ({
    aggregate: jest.fn().mockResolvedValue(105000),
  })),
}));

const axios = require("axios");

let oracle;
beforeEach(() => {
  jest.resetModules();
  jest.mock("axios");
  jest.mock("./medianizer", () => ({
    OracleMedianizer: jest.fn().mockImplementation(() => ({
      aggregate: jest.fn().mockResolvedValue(105000),
    })),
  }));
  oracle = require("./index");
  oracle._resetState();
  jest.clearAllMocks();
});

function makeMarket(overrides = {}) {
  return {
    id: 42,
    question: "Will BTC reach $100k?",
    outcomes: ["Yes", "No"],
    category_slug: "crypto",
    total_pool: "0",
    resolved: false,
    end_date: new Date(Date.now() - 70_000).toISOString(),
    ...overrides,
  };
}

describe("High-Value Oracle Two-Factor Confirmation", () => {
  test("below threshold: resolves immediately via /api/markets/:id/resolve", async () => {
    const market = makeMarket({ total_pool: "50000000000" }); // 5000 XLM < 10000 XLM threshold
    axios.post.mockResolvedValue({ data: { success: true } });

    await oracle.resolveMarket(market);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining(`/api/markets/${market.id}/resolve`),
      expect.objectContaining({ winningOutcome: expect.any(Number) })
    );
    expect(axios.post).not.toHaveBeenCalledWith(
      expect.stringContaining("pending-confirmation"),
      expect.anything()
    );
  });

  test("above threshold: sets PENDING_CONFIRMATION instead of resolving", async () => {
    const market = makeMarket({ total_pool: "200000000000" }); // 20000 XLM > 10000 XLM threshold
    axios.post.mockResolvedValue({ data: { success: true } });

    await oracle.resolveMarket(market);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining(`/api/admin/markets/${market.id}/pending-confirmation`),
      expect.objectContaining({ proposedOutcome: expect.any(Number) })
    );
    expect(axios.post).not.toHaveBeenCalledWith(
      expect.stringContaining(`/api/markets/${market.id}/resolve`),
      expect.anything()
    );
  });

  test("above threshold: sends admin alert when webhook configured", async () => {
    const market = makeMarket({ total_pool: "200000000000" });
    const webhookUrl = "https://hooks.example.com/alert";
    process.env.ADMIN_ALERT_WEBHOOK_URL = webhookUrl;
    axios.post.mockResolvedValue({ data: {} });

    await oracle.resolveMarket(market);

    expect(axios.post).toHaveBeenCalledWith(
      webhookUrl,
      expect.objectContaining({
        type: "high_value_pending_confirmation",
        market_id: market.id,
        proposed_outcome: expect.any(Number),
      })
    );

    delete process.env.ADMIN_ALERT_WEBHOOK_URL;
  });

  test("sendAdminAlert is a no-op when ADMIN_ALERT_WEBHOOK_URL is not set", async () => {
    delete process.env.ADMIN_ALERT_WEBHOOK_URL;
    const market = makeMarket({ total_pool: "200000000000" });
    axios.post.mockResolvedValue({ data: {} });

    await oracle.resolveMarket(market);

    // Only the pending-confirmation call, no webhook call
    const calls = axios.post.mock.calls.map((c) => c[0]);
    expect(calls.every((url) => url.includes("pending-confirmation") || url.includes("admin"))).toBe(true);
  });
});
