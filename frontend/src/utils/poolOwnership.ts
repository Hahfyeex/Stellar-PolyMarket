/**
 * poolOwnership.ts
 *
 * Data transformation utilities for the PoolOwnershipChart.
 *
 * Pipeline:
 *   raw bets[] → group by wallet → sum amounts → calculate % share
 *   → sort descending → group wallets below OTHERS_THRESHOLD into "Others"
 */

export const OTHERS_THRESHOLD = 1; // wallets below 1% are grouped into "Others"

export interface RawBet {
  wallet_address: string;
  amount: string | number;
}

export interface OwnershipSlice {
  /** Abbreviated wallet label (e.g. "GABC...XY12") or "Others" */
  label: string;
  /** Full wallet address, null for the "Others" aggregate */
  wallet: string | null;
  /** Total XLM staked */
  amount: number;
  /** Percentage share of total pool (0–100) */
  percentage: number;
}

/**
 * Abbreviate a Stellar wallet address for display.
 * e.g. "GABCDEFGHIJKLMNOP...XY12"
 */
export function abbreviateWallet(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Transform raw bets into ownership slices for the pie chart.
 *
 * Steps:
 * 1. Group bets by wallet_address, summing amounts
 * 2. Compute each wallet's % share of totalPool
 * 3. Sort descending by amount
 * 4. Wallets with share < OTHERS_THRESHOLD% are merged into a single "Others" slice
 *
 * @param bets      - Raw bet records from GET /api/markets/:id
 * @param totalPool - Total pool value (used as denominator for % calculation)
 */
export function buildOwnershipSlices(
  bets: RawBet[],
  totalPool: number
): OwnershipSlice[] {
  if (!bets.length || totalPool <= 0) return [];

  // Step 1: Aggregate amounts per wallet
  const walletMap = new Map<string, number>();
  for (const bet of bets) {
    const amt = typeof bet.amount === "string" ? parseFloat(bet.amount) : bet.amount;
    if (!isFinite(amt) || amt <= 0) continue;
    walletMap.set(bet.wallet_address, (walletMap.get(bet.wallet_address) ?? 0) + amt);
  }

  // Step 2: Build slice objects with percentage
  const slices: OwnershipSlice[] = Array.from(walletMap.entries()).map(
    ([wallet, amount]) => ({
      label: abbreviateWallet(wallet),
      wallet,
      amount,
      percentage: (amount / totalPool) * 100,
    })
  );

  // Step 3: Sort descending by amount
  slices.sort((a, b) => b.amount - a.amount);

  // Step 4: Split into significant (≥ threshold) and others (< threshold)
  const significant = slices.filter((s) => s.percentage >= OTHERS_THRESHOLD);
  const others = slices.filter((s) => s.percentage < OTHERS_THRESHOLD);

  if (!others.length) return significant;

  // Merge all "others" into one aggregate slice
  const othersAmount = others.reduce((sum, s) => sum + s.amount, 0);
  const othersSlice: OwnershipSlice = {
    label: "Others",
    wallet: null,
    amount: othersAmount,
    percentage: (othersAmount / totalPool) * 100,
  };

  return [...significant, othersSlice];
}
