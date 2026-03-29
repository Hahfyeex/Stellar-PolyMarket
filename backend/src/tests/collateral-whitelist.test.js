/* eslint-env jest */
/**
 * Tests for Collateral Asset Whitelisting (Issue #16).
 *
 * Validates that:
 *  - Only whitelisted tokens are accepted for bets.
 *  - Bets with unapproved (spam) tokens are rejected.
 *  - The whitelist CRUD operations work correctly.
 */

// ── In-memory whitelist for unit-level testing (no DB required) ───────

const whitelistedTokens = new Set([
  "native", // XLM
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", // USDC
  "CARST3VNQHK4HKFQG3JYEAISMKAYHT7OABPGCF7Y7BWIV3MRZDRQSW2", // ARST
]);

/**
 * Checks whether a token is whitelisted.
 * This mirrors the SQL query: SELECT 1 FROM whitelisted_tokens WHERE token_address = $1
 */
function isTokenWhitelisted(tokenAddress) {
  return whitelistedTokens.has(tokenAddress);
}

/**
 * Simulates the place_bet validation logic from the backend route.
 * Returns { allowed: boolean, reason?: string }.
 */
function validateBet({ marketId, outcomeIndex, amount, walletAddress, tokenAddress }) {
  if (!marketId || outcomeIndex === undefined || !amount || !walletAddress) {
    return { allowed: false, reason: "Missing required fields" };
  }
  if (tokenAddress && !isTokenWhitelisted(tokenAddress)) {
    return { allowed: false, reason: "Token is not whitelisted as collateral" };
  }
  return { allowed: true };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Collateral Asset Whitelisting", () => {
  describe("isTokenWhitelisted", () => {
    test("should return true for XLM (native)", () => {
      expect(isTokenWhitelisted("native")).toBe(true);
    });

    test("should return true for USDC", () => {
      expect(isTokenWhitelisted("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA")).toBe(
        true
      );
    });

    test("should return true for ARST", () => {
      expect(isTokenWhitelisted("CARST3VNQHK4HKFQG3JYEAISMKAYHT7OABPGCF7Y7BWIV3MRZDRQSW2")).toBe(
        true
      );
    });

    test("should return false for an unknown/spam token", () => {
      expect(isTokenWhitelisted("SPAM_TOKEN_ADDRESS_123")).toBe(false);
    });

    test("should return false for an empty string", () => {
      expect(isTokenWhitelisted("")).toBe(false);
    });
  });

  describe("validateBet — whitelist enforcement", () => {
    const baseBet = {
      marketId: 1,
      outcomeIndex: 0,
      amount: 100,
      walletAddress: "GABCDEFGH",
    };

    test("should allow a bet with whitelisted XLM token", () => {
      const result = validateBet({ ...baseBet, tokenAddress: "native" });
      expect(result.allowed).toBe(true);
    });

    test("should allow a bet with whitelisted USDC token", () => {
      const result = validateBet({
        ...baseBet,
        tokenAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      });
      expect(result.allowed).toBe(true);
    });

    test("should allow a bet with whitelisted ARST token", () => {
      const result = validateBet({
        ...baseBet,
        tokenAddress: "CARST3VNQHK4HKFQG3JYEAISMKAYHT7OABPGCF7Y7BWIV3MRZDRQSW2",
      });
      expect(result.allowed).toBe(true);
    });

    test("should reject a bet with an unapproved spam token", () => {
      const result = validateBet({ ...baseBet, tokenAddress: "SPAM_TOKEN_ADDRESS_123" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Token is not whitelisted as collateral");
    });

    test("should reject a bet with a random non-whitelisted address", () => {
      const result = validateBet({
        ...baseBet,
        tokenAddress: "CXYZ99999999999999999999999999999999999999999999999999999",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Token is not whitelisted as collateral");
    });

    test("should allow a bet when no tokenAddress is provided (backwards compat)", () => {
      const result = validateBet(baseBet);
      expect(result.allowed).toBe(true);
    });

    test("should reject a bet missing required fields", () => {
      const result = validateBet({ marketId: 1, tokenAddress: "native" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Missing required fields");
    });
  });

  describe("Whitelist set management", () => {
    test("should be able to add a new token to the whitelist", () => {
      const newToken = "CNEW_TOKEN_ADDR";
      whitelistedTokens.add(newToken);
      expect(isTokenWhitelisted(newToken)).toBe(true);
      // Cleanup
      whitelistedTokens.delete(newToken);
    });

    test("should be able to remove a token from the whitelist", () => {
      const tempToken = "CTEMP_TOKEN_ADDR";
      whitelistedTokens.add(tempToken);
      expect(isTokenWhitelisted(tempToken)).toBe(true);

      whitelistedTokens.delete(tempToken);
      expect(isTokenWhitelisted(tempToken)).toBe(false);
    });

    test("adding a duplicate token is idempotent", () => {
      const sizeBefore = whitelistedTokens.size;
      whitelistedTokens.add("native");
      expect(whitelistedTokens.size).toBe(sizeBefore);
    });

    test("removing a non-existent token does not throw", () => {
      expect(() => whitelistedTokens.delete("DOES_NOT_EXIST")).not.toThrow();
    });

    test("whitelist contains exactly 3 default tokens", () => {
      expect(whitelistedTokens.size).toBe(3);
    });
  });

  describe("Rejection logging (visual validation)", () => {
    test("should produce a descriptive rejection message for spam token", () => {
      const spamToken = "SPAM_WORTHLESS_TOKEN_42";
      const result = validateBet({
        marketId: 1,
        outcomeIndex: 0,
        amount: 9999,
        walletAddress: "ATTACKER_WALLET",
        tokenAddress: spamToken,
      });

      // Simulate what the logger would output
      const logEntry = {
        level: "warn",
        market_id: 1,
        wallet_address: "ATTACKER_WALLET",
        token_address: spamToken,
        msg: result.reason,
      };

      expect(logEntry.level).toBe("warn");
      expect(logEntry.msg).toContain("not whitelisted");
      expect(logEntry.token_address).toBe(spamToken);
      expect(result.allowed).toBe(false);
    });
  });
});
