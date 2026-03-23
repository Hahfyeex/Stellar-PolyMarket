/**
 * Mocking DB and testing the token-mapping logic.
 * We want to ensure that for a given market, we find all associated wallet addresses
 * and map them correctly to their registered FCM tokens while respecting preferences.
 */

// Simple mock for the mapping logic since we don't have a separate module for it yet
// Let's create a functional representation of the query used in the Cloud Function
function mapWalletsToTokens(bets, notifications, marketId, status) {
  const prefKey = status === "PROPOSED" ? "market_proposed" : "market_resolved";
  
  // 1. Find all wallets that bet on this market
  const marketBets = bets.filter(b => b.market_id === marketId);
  const uniqueWallets = [...new Set(marketBets.map(b => b.wallet_address))];

  // 2. Map to tokens and filter by preferences
  return uniqueWallets
    .map(addr => notifications.find(n => n.wallet_address === addr))
    .filter(u => u && u.fcm_token && u.preferences[prefKey])
    .map(u => u.fcm_token);
}

describe("Token Mapping Logic", () => {
  const mockBets = [
    { market_id: 1, wallet_address: "ADDR1", amount: 10 },
    { market_id: 1, wallet_address: "ADDR2", amount: 20 },
    { market_id: 1, wallet_address: "ADDR1", amount: 5 }, // Duplicate walker
    { market_id: 2, wallet_address: "ADDR3", amount: 50 },
  ];

  const mockNotifications = [
    { 
      wallet_address: "ADDR1", 
      fcm_token: "TOKEN1", 
      preferences: { market_proposed: true, market_resolved: true } 
    },
    { 
      wallet_address: "ADDR2", 
      fcm_token: "TOKEN2", 
      preferences: { market_proposed: false, market_resolved: true } 
    },
    { 
      wallet_address: "ADDR3", 
      fcm_token: "TOKEN3", 
      preferences: { market_proposed: true, market_resolved: true } 
    },
  ];

  test("should map multiple unique wallets to FCM tokens for RESOLVED state", () => {
    const tokens = mapWalletsToTokens(mockBets, mockNotifications, 1, "RESOLVED");
    expect(tokens).toContain("TOKEN1");
    expect(tokens).toContain("TOKEN2");
    expect(tokens.length).toBe(2);
  });

  test("should respect notification preferences for PROPOSED state", () => {
    const tokens = mapWalletsToTokens(mockBets, mockNotifications, 1, "PROPOSED");
    expect(tokens).toContain("TOKEN1");
    expect(tokens).not.toContain("TOKEN2"); // Pref is false
    expect(tokens.length).toBe(1);
  });

  test("should return empty array for market with no bets", () => {
    const tokens = mapWalletsToTokens(mockBets, mockNotifications, 999, "RESOLVED");
    expect(tokens.length).toBe(0);
  });

  test("should only return tokens for users who have registered", () => {
    const incompleteBets = [
      ...mockBets,
      { market_id: 1, wallet_address: "ADDR_UNREGISTERED", amount: 10 }
    ];
    const tokens = mapWalletsToTokens(incompleteBets, mockNotifications, 1, "RESOLVED");
    expect(tokens.length).toBe(2); // Only ADDR1 and ADDR2
  });
});
