const db = require("../../db");
const { triggerNotification } = require("../../utils/notifications");
const logger = require("../../utils/logger");

jest.mock("../../db");
jest.mock("../../utils/logger");

describe("triggerNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully insert a notification", async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    await triggerNotification("0x123", "TEST_TYPE", "Test message", 1);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO notifications"),
      ["0x123", "TEST_TYPE", "Test message", 1]
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ type: "TEST_TYPE" }),
      "Notification inserted"
    );
  });

  it("should handle error and insert into failed_notifications", async () => {
    const error = new Error("Database connection failed");
    // First call to notifications table fails
    db.query.mockRejectedValueOnce(error);
    // Second call to failed_notifications table succeeds
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    await triggerNotification("0x123", "TEST_TYPE", "Test message", 1);

    // Verify main insertion was attempted
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO notifications"),
      expect.any(Array)
    );

    // Verify error was logged at warn level
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: error.message, market_id: 1, type: "TEST_TYPE" }),
      "Failed to insert notification"
    );

    // Verify dead-letter insertion was attempted
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO failed_notifications"),
      ["0x123", "TEST_TYPE", "Test message", 1, error.message]
    );
  });

  it("should not crash if both notification and failed_notification insertion fail", async () => {
    const error1 = new Error("Primary DB failure");
    const error2 = new Error("DLQ DB failure");
    
    db.query.mockRejectedValueOnce(error1);
    db.query.mockRejectedValueOnce(error2);

    // This should NOT throw
    await expect(triggerNotification("0x123", "TEST_TYPE", "Test message", 1)).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error2.message, original_err: error1.message }),
      expect.stringContaining("Critical error")
    );
  });
});

// Integration-like test for the route
const request = require("supertest");
const app = require("../../index");

describe("Market resolution route with triggerNotification failure", () => {
  it("should succeed even if triggerNotification fails", async () => {
    // Mock the resolve update
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, question: "Test?", resolved: true }]
    });

    // Mock triggerNotification failure (it's inside the route)
    // Actually triggerNotification is imported and used in the route.
    // Since we mock db.query globally, the call inside triggerNotification will also fail.
    
    // 1st query: UPDATE markets (success)
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: "PROPOSED", winning_outcome: 1 }]
    });
    // 2nd query: INSERT INTO notifications (fail)
    db.query.mockRejectedValueOnce(new Error("Notification failure"));
    // 3rd query: INSERT INTO failed_notifications (success)
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const response = await request(app)
      .post("/api/markets/1/propose")
      .send({ proposedOutcome: 1 });

    expect(response.status).toBe(200);
    expect(response.body.market).toBeDefined();
    // The route continues even though notification failing
  });
});
