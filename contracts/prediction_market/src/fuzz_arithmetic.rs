/// fuzz_arithmetic.rs — Proptest fuzz tests for all arithmetic paths.
///
/// Feeds random i128 values into every checked_math helper and every
/// payout/fee calculation to verify:
///   1. No silent wrapping — overflow always panics with a message.
///   2. Valid inputs produce results within expected bounds.
///   3. Payout invariants hold: sum of payouts ≤ total_pool.
///   4. Fee invariants hold: fee + payout_pool == total_pool (within rounding).
///   5. LMSR cost delta is always positive when buying shares.
///
/// Run with: cargo test --features testutils fuzz_

#[cfg(test)]
mod fuzz_tests {
    use proptest::prelude::*;
    use crate::checked_math::{cadd, csub, cmul, cdiv, cmuldiv};
    use crate::lmsr::{lmsr_cost, lmsr_price, SCALE};
    use crate::calculate_dynamic_fee;

    // ── checked_math helpers ──────────────────────────────────────────────────

    proptest! {
        /// cadd: valid (non-overflowing) inputs always return a + b.
        #[test]
        fn fuzz_cadd_valid(
            a in i64::MIN as i128..=i64::MAX as i128,
            b in i64::MIN as i128..=i64::MAX as i128,
        ) {
            let result = cadd(a, b, "fuzz cadd");
            prop_assert_eq!(result, a + b);
        }

        /// csub: valid (non-underflowing) inputs always return a - b.
        #[test]
        fn fuzz_csub_valid(
            a in i64::MIN as i128..=i64::MAX as i128,
            b in i64::MIN as i128..=i64::MAX as i128,
        ) {
            let result = csub(a, b, "fuzz csub");
            prop_assert_eq!(result, a - b);
        }

        /// cmul: valid (non-overflowing) inputs always return a * b.
        #[test]
        fn fuzz_cmul_valid(
            a in -1_000_000_000i128..=1_000_000_000i128,
            b in -1_000_000_000i128..=1_000_000_000i128,
        ) {
            let result = cmul(a, b, "fuzz cmul");
            prop_assert_eq!(result, a * b);
        }

        /// cdiv: non-zero divisor always returns a / b.
        #[test]
        fn fuzz_cdiv_valid(
            a in i64::MIN as i128..=i64::MAX as i128,
            b in 1i128..=i64::MAX as i128,
        ) {
            let result = cdiv(a, b, "fuzz cdiv");
            prop_assert_eq!(result, a / b);
        }

        /// cmuldiv: (a * b) / c matches manual calculation for safe ranges.
        #[test]
        fn fuzz_cmuldiv_valid(
            a in 0i128..=1_000_000_000i128,
            b in 0i128..=1_000_000_000i128,
            c in 1i128..=1_000_000_000i128,
        ) {
            let result = cmuldiv(a, b, c, "fuzz cmuldiv");
            prop_assert_eq!(result, (a * b) / c);
        }
    }

    // ── calculate_dynamic_fee ─────────────────────────────────────────────────

    proptest! {
        /// Fee is always in [50, 200] bps for any non-negative volume.
        #[test]
        fn fuzz_dynamic_fee_bounds(volume in 0i128..=i64::MAX as i128) {
            let fee = calculate_dynamic_fee(volume);
            prop_assert!(fee >= 50, "fee below floor: {}", fee);
            prop_assert!(fee <= 200, "fee above ceiling: {}", fee);
        }

        /// Fee is monotonically non-increasing as volume grows.
        #[test]
        fn fuzz_dynamic_fee_monotone(
            v1 in 0i128..=500_000_000_000i128,
            v2 in 0i128..=500_000_000_000i128,
        ) {
            let (lo, hi) = if v1 <= v2 { (v1, v2) } else { (v2, v1) };
            let fee_lo = calculate_dynamic_fee(lo);
            let fee_hi = calculate_dynamic_fee(hi);
            prop_assert!(fee_hi <= fee_lo, "fee increased with volume: {} > {}", fee_hi, fee_lo);
        }
    }

    // ── payout invariants ─────────────────────────────────────────────────────

    proptest! {
        /// For any valid pool and winning stake, the sum of individual payouts
        /// must not exceed the payout_pool (rounding may leave dust).
        #[test]
        fn fuzz_payout_sum_le_pool(
            total_pool   in 1_000_000i128..=1_000_000_000_000i128,
            n_winners    in 1usize..=20usize,
            // Each winner's stake as a fraction of total (0..100)
            stakes_raw   in proptest::collection::vec(1u32..=100u32, 1..=20),
        ) {
            let n = n_winners.min(stakes_raw.len());
            let stakes: Vec<i128> = stakes_raw[..n].iter().map(|&s| s as i128).collect();
            let winning_stake: i128 = stakes.iter().sum();

            let fee_bps = calculate_dynamic_fee(total_pool);
            let payout_pool = cmuldiv(
                total_pool,
                csub(10000, fee_bps as i128, "test fee complement"),
                10000,
                "test payout pool",
            );

            let mut total_paid: i128 = 0;
            for &stake in &stakes {
                let payout = cmuldiv(stake, payout_pool, winning_stake, "test payout");
                total_paid = cadd(total_paid, payout, "test total paid");
            }

            // Due to integer division rounding, total_paid ≤ payout_pool
            prop_assert!(
                total_paid <= payout_pool,
                "payouts {} exceed pool {}", total_paid, payout_pool
            );
            // Dust (rounding loss) must be < number of winners (1 stroop per winner max)
            prop_assert!(
                payout_pool - total_paid < n as i128,
                "excessive rounding dust: pool={} paid={} n={}", payout_pool, total_paid, n
            );
        }

        /// fee_amount + payout_pool == total_pool (within 1 stroop rounding).
        #[test]
        fn fuzz_fee_plus_payout_equals_pool(
            total_pool in 1_000_000i128..=1_000_000_000_000i128,
        ) {
            let fee_bps = calculate_dynamic_fee(total_pool);
            let fee_amount   = cmuldiv(total_pool, fee_bps as i128, 10000, "test fee");
            let payout_pool  = cmuldiv(total_pool, csub(10000, fee_bps as i128, "test complement"), 10000, "test payout");
            let reconstructed = cadd(fee_amount, payout_pool, "test reconstruct");
            // Allow ≤1 stroop rounding difference
            prop_assert!(
                (total_pool - reconstructed).abs() <= 1,
                "fee+payout != pool: {} + {} = {} != {}",
                fee_amount, payout_pool, reconstructed, total_pool
            );
        }
    }

    // ── LMSR arithmetic ───────────────────────────────────────────────────────

    proptest! {
        /// lmsr_cost is always positive for any non-negative share quantities.
        #[test]
        fn fuzz_lmsr_cost_positive(
            b  in 1_000_000i128..=100_000_000i128,
            q0 in 0i128..=50_000_000i128,
            q1 in 0i128..=50_000_000i128,
        ) {
            let q = [q0, q1];
            let cost = lmsr_cost(&q, b);
            prop_assert!(cost >= 0, "lmsr_cost negative: {}", cost);
        }

        /// Buying shares always increases cost (cost delta > 0).
        #[test]
        fn fuzz_lmsr_cost_delta_positive(
            b      in 1_000_000i128..=100_000_000i128,
            q0     in 0i128..=50_000_000i128,
            q1     in 0i128..=50_000_000i128,
            shares in 1i128..=10_000_000i128,
        ) {
            let q_before = [q0, q1];
            let q_after  = [cadd(q0, shares, "fuzz q_after"), q1];
            let cost_before = lmsr_cost(&q_before, b);
            let cost_after  = lmsr_cost(&q_after, b);
            let delta = csub(cost_after, cost_before, "fuzz cost delta");
            prop_assert!(delta > 0, "cost delta not positive: {}", delta);
        }

        /// lmsr_price values sum to SCALE (≈1.0) within 1% tolerance.
        #[test]
        fn fuzz_lmsr_prices_sum_to_one(
            b  in 1_000_000i128..=100_000_000i128,
            q0 in 0i128..=50_000_000i128,
            q1 in 0i128..=50_000_000i128,
            q2 in 0i128..=50_000_000i128,
        ) {
            let q = [q0, q1, q2];
            let p0 = lmsr_price(&q, b, 0);
            let p1 = lmsr_price(&q, b, 1);
            let p2 = lmsr_price(&q, b, 2);
            let total = cadd(cadd(p0, p1, "fuzz price sum"), p2, "fuzz price sum");
            prop_assert!(
                (total - SCALE).abs() < SCALE / 100,
                "prices don't sum to 1: {} (p0={} p1={} p2={})", total, p0, p1, p2
            );
        }
    }

    // ── overflow boundary tests ───────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "arithmetic overflow")]
    fn cadd_overflows_at_max() {
        cadd(i128::MAX, 1, "overflow test");
    }

    #[test]
    #[should_panic(expected = "arithmetic overflow")]
    fn csub_underflows_at_min() {
        csub(i128::MIN, 1, "underflow test");
    }

    #[test]
    #[should_panic(expected = "arithmetic overflow")]
    fn cmul_overflows_large_values() {
        cmul(i128::MAX / 2 + 1, 2, "overflow test");
    }

    #[test]
    #[should_panic(expected = "arithmetic overflow")]
    fn cdiv_panics_on_zero_divisor() {
        cdiv(100, 0, "div zero test");
    }

    #[test]
    #[should_panic(expected = "arithmetic overflow")]
    fn cmuldiv_overflows_intermediate() {
        // a * b overflows even though (a * b) / c would fit
        cmuldiv(i128::MAX / 2 + 1, 2, 2, "overflow test");
    }
}
