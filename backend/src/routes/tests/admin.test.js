jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
  firestore: jest.fn(() => ({})),
}));
jest.mock("../../db");

const request = require("supertest");
const app = require("../../index");
const db = require("../../db");

describe("Admin Audit Trail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should log admin actions on market resolution", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, outcomes: ["Yes", "No"], resolved: false }] }) // Market exists
      .mockResolvedValueOnce({}); // Update market

    const response = await request(app)
      .post("/api/admin/markets/1/resolve")
      .set("Authorization", "Bearer admin-token")
      .send({ winning_outcome: 0 });

    expect(response.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO admin_audit_log"),
      expect.arrayContaining(["admin-token", "RESOLVE_MARKET", 1, "MARKET"])
    );
  });

  it("should fetch audit logs with filters", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          admin_wallet: "admin-wallet",
          action_type: "RESOLVE_MARKET",
          target_id: 1,
          target_type: "MARKET",
          payload: { winning_outcome: 0 },
          ip_address: "127.0.0.1",
          created_at: new Date(),
        },
      ],
    });

    const response = await request(app)
      .get("/api/admin/audit-log")
      .set("Authorization", "Bearer admin-token")
      .query({ actionType: "RESOLVE_MARKET" });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].action_type).toBe("RESOLVE_MARKET");
  });
});
