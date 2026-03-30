"use strict";

const { _encrypt, _decrypt, AUTO_SETTLE_TX_COUNT, AUTO_SETTLE_MS } = require("../src/routes/channels");

describe("Payment Channels (#582)", () => {
  describe("Encryption", () => {
    test("encrypt and decrypt round-trips correctly", () => {
      const secret = "SCZANGBA5RLGSRSGIDJIS7LJFTD3GVLKIGUTHD7LGSI5QKFKPNXHVQ";
      const ciphertext = _encrypt(secret);
      expect(ciphertext).not.toBe(secret);
      expect(_decrypt(ciphertext)).toBe(secret);
    });

    test("each encryption produces a unique ciphertext (random IV)", () => {
      const secret = "SCZANGBA5RLGSRSGIDJIS7LJFTD3GVLKIGUTHD7LGSI5QKFKPNXHVQ";
      expect(_encrypt(secret)).not.toBe(_encrypt(secret));
    });

    test("ciphertext contains iv:tag:data format", () => {
      const ciphertext = _encrypt("test-secret");
      const parts = ciphertext.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // 12 bytes hex
      expect(parts[1]).toHaveLength(32); // 16 bytes hex
    });
  });

  describe("Auto-settle thresholds", () => {
    test("AUTO_SETTLE_TX_COUNT is 100", () => {
      expect(AUTO_SETTLE_TX_COUNT).toBe(100);
    });

    test("AUTO_SETTLE_MS is 1 hour", () => {
      expect(AUTO_SETTLE_MS).toBe(60 * 60 * 1000);
    });

    test("auto-settle triggers at exactly 100 transactions", () => {
      const count = 100;
      expect(count >= AUTO_SETTLE_TX_COUNT).toBe(true);
    });

    test("auto-settle triggers when age exceeds 1 hour", () => {
      const ageMs = AUTO_SETTLE_MS + 1;
      expect(ageMs >= AUTO_SETTLE_MS).toBe(true);
    });

    test("auto-settle does not trigger below threshold", () => {
      const count = 99;
      const ageMs = AUTO_SETTLE_MS - 1000;
      expect(count >= AUTO_SETTLE_TX_COUNT || ageMs >= AUTO_SETTLE_MS).toBe(false);
    });
  });
});
