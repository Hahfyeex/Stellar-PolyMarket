/// Fixed-point LMSR (Logarithmic Market Scoring Rule) math.
///
/// All values use 7-decimal precision: SCALE = 10_000_000 (1.0 = 10_000_000).
/// No floats anywhere — only i128 arithmetic.
///
/// LMSR cost function:  C(q) = b * ln( Σ exp(q_i / b) )
/// Price of outcome i:  p_i  = exp(q_i / b) / Σ exp(q_j / b)
/// Cost to move shares: ΔC   = C(q_after) - C(q_before)

pub const SCALE: i128 = 10_000_000; // 1.0 in fixed-point

/// Fixed-point natural log approximation.
/// Input `x` is in SCALE units (x > 0).
/// Returns ln(x) in SCALE units.
///
/// Uses identity: ln(x) = ln(m * 2^k) = k*ln(2) + ln(m), where m ∈ [0.5, 1).
/// ln(m) approximated by a 3rd-order minimax polynomial on [0.5, 1):
///   ln(m) ≈ a0 + a1*(m-1) + a2*(m-1)^2 + a3*(m-1)^3
/// Coefficients (scaled): a1≈1, a2≈-0.5, a3≈0.3333
pub fn ln_fp(x: i128) -> i128 {
    assert!(x > 0, "ln undefined for x <= 0");
    if x == SCALE {
        return 0;
    }

    const LN2: i128 = 6_931_472;

    let mut val = x;
    let mut k: i128 = 0;

    // Normalize val into [0.707 * SCALE, 1.414 * SCALE]
    // 0.707 * 10^7 = 7,071,068
    // 1.414 * 10^7 = 14,142,136
    while val < 7_071_068 {
        val <<= 1;
        k -= 1;
    }
    while val > 14_142_136 {
        val >>= 1;
        k += 1;
    }

    // ln(x) = k*ln(2) + ln(val/SCALE)
    // Let m = val/SCALE. m is in [0.707, 1.414].
    // Let t = m - 1 = (val - SCALE) / SCALE. t is in [-0.293, 0.414].
    // ln(1 + t) ≈ t - t^2/2 + t^3/3 - t^4/4 + t^5/5 - t^6/6 + t^7/7 - t^8/8
    let t = val - SCALE;
    if t == 0 {
        return k * LN2;
    }

    let t2 = t * t / SCALE;
    let t3 = t2 * t / SCALE;
    let t4 = t3 * t / SCALE;
    let t5 = t4 * t / SCALE;
    let t6 = t5 * t / SCALE;
    let t7 = t6 * t / SCALE;
    let t8 = t7 * t / SCALE;

    let ln_m = t - t2 / 2 + t3 / 3 - t4 / 4 + t5 / 5 - t6 / 6 + t7 / 7 - t8 / 8;

    k * LN2 + ln_m
}

pub fn exp_fp(x: i128) -> i128 {
    if x == 0 {
        return SCALE;
    }
    const MAX_X: i128 = 88 * SCALE;
    const MIN_X: i128 = -88 * SCALE;
    if x >= MAX_X { return i128::MAX / SCALE; }
    if x <= MIN_X { return 0; }

    const LN2: i128 = 6_931_472;

    // Decompose x = k*ln2 + r, r ∈ [0, ln2)
    let mut k = x / LN2;
    let mut r = x % LN2;
    if r < 0 {
        r += LN2;
        k -= 1;
    }

    // Taylor: exp(r) = 1 + r + r^2/2 + r^3/6 + r^4/24 + r^5/120
    let r2 = r * r / SCALE;
    let r3 = r2 * r / SCALE;
    let r4 = r3 * r / SCALE;
    let r5 = r4 * r / SCALE;

    let exp_r = SCALE + r + r2 / 2 + r3 / 6 + r4 / 24 + r5 / 120;

    if k >= 0 {
        if k > 60 { return i128::MAX / SCALE; }
        exp_r << k
    } else {
        if k < -60 { return 0; }
        exp_r >> (-k)
    }
}

/// LMSR cost function: C(q) = b * ln( Σ exp(q_i / b) )
/// `q` — outcome share quantities in stroops (raw i128, NOT scaled)
/// `b` — liquidity parameter in stroops (raw i128, NOT scaled)
/// Returns cost in stroops.
pub fn lmsr_cost(q: &[i128], b: i128) -> i128 {
    assert!(b > 0, "b must be positive");

    let mut q_max = q[0];
    for &qi in q {
        if qi > q_max {
            q_max = qi;
        }
    }

    // C = q_max + b * ln( Σ exp((q_i - q_max) / b) )
    let mut sum_exp: i128 = 0;
    for &qi in q {
        let arg = (qi - q_max) * SCALE / b; 
        sum_exp += exp_fp(arg);
    }

    q_max + (b * ln_fp(sum_exp) / SCALE)
}

/// Price of outcome `i`: p_i = exp(q_i/b) / Σ exp(q_j/b)
/// Returns probability in SCALE units (SCALE = 1.0).
pub fn lmsr_price(q: &[i128], b: i128, i: usize) -> i128 {
    assert!(b > 0, "b must be positive");
    assert!(i < q.len(), "index out of range");

    let mut sum_exp: i128 = 0;
    let mut exp_i: i128 = 0;
    for (j, &qj) in q.iter().enumerate() {
        let e = exp_fp(qj * SCALE / b);
        sum_exp += e;
        if j == i {
            exp_i = e;
        }
    }

    exp_i * SCALE / sum_exp
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ln_fp_one() {
        // ln(1.0) = 0
        assert_eq!(ln_fp(SCALE), 0);
    }

    #[test]
    fn test_ln_fp_e() {
        // ln(e) ≈ 1.0; e*SCALE ≈ 27_182_818
        let result = ln_fp(27_182_818);
        // Allow ±1% tolerance
        assert!((result - SCALE).abs() < SCALE / 100, "ln(e) off: {}", result);
    }

    #[test]
    fn test_exp_fp_zero() {
        // exp(0) = 1.0
        assert_eq!(exp_fp(0), SCALE);
    }

    #[test]
    fn test_exp_fp_one() {
        // exp(1.0) ≈ 2.7182818; result should be within 1%
        let result = exp_fp(SCALE);
        let expected = 27_182_818i128;
        assert!((result - expected).abs() < expected / 100, "exp(1) off: {}", result);
    }

    #[test]
    fn test_exp_ln_roundtrip() {
        // exp(ln(x)) ≈ x for x = 2.0
        let x = 2 * SCALE;
        let ln_x = ln_fp(x);
        let result = exp_fp(ln_x);
        assert!((result - x).abs() < x / 100, "roundtrip off: {}", result);
    }

    #[test]
    fn test_lmsr_cost_symmetric() {
        // With equal shares, cost should be b * ln(n)
        let b = 100_000_000i128; // 10 XLM
        let q = [0i128, 0i128]; // two outcomes, no shares yet
        let cost = lmsr_cost(&q, b);
        // b * ln(2) ≈ 100_000_000 * 0.6931472 = 69_314_720
        let expected = 69_314_720i128;
        assert!((cost - expected).abs() < expected / 100, "symmetric cost off: {}", cost);
    }

    #[test]
    fn test_lmsr_price_equal_shares() {
        // Equal shares → each outcome has price 0.5
        let b = 100_000_000i128;
        let q = [0i128, 0i128];
        let p0 = lmsr_price(&q, b, 0);
        let p1 = lmsr_price(&q, b, 1);
        assert!((p0 - SCALE / 2).abs() < SCALE / 100, "p0 off: {}", p0);
        assert!((p1 - SCALE / 2).abs() < SCALE / 100, "p1 off: {}", p1);
    }

    #[test]
    fn test_lmsr_price_sums_to_one() {
        let b = 100_000_000i128;
        let q = [50_000_000i128, 20_000_000i128, 30_000_000i128];
        let total = lmsr_price(&q, b, 0) + lmsr_price(&q, b, 1) + lmsr_price(&q, b, 2);
        // Should sum to SCALE ± 1%
        assert!((total - SCALE).abs() < SCALE / 100, "prices don't sum to 1: {}", total);
    }

    #[test]
    fn test_lmsr_cost_delta_positive() {
        // Buying shares on outcome 0 should cost a positive amount
        let b = 100_000_000i128;
        let q_before = [0i128, 0i128];
        let q_after = [50_000_000i128, 0i128];
        let delta = lmsr_cost(&q_after, b) - lmsr_cost(&q_before, b);
        assert!(delta > 0, "cost delta should be positive: {}", delta);
    }
}
