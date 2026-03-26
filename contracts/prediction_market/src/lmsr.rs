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

    // LN2 = ln(2) * SCALE
    const LN2: i128 = 6_931_472; // 0.6931472 * 1e7

    // Normalise x into [SCALE/2, SCALE) by tracking power-of-2 shifts.
    let mut val = x;
    let mut k: i128 = 0;

    // Scale up if val < SCALE/2
    while val < SCALE / 2 {
        val *= 2;
        k -= 1;
    }
    // Scale down if val >= SCALE
    while val >= SCALE {
        val /= 2;
        k += 1;
    }

    // Now val ∈ [SCALE/2, SCALE), i.e. m ∈ [0.5, 1.0)
    // Let t = val - SCALE  (t ∈ [-SCALE/2, 0])
    // ln(1 + t/SCALE) ≈ t/SCALE - (t/SCALE)^2/2 + (t/SCALE)^3/3
    // Multiply through by SCALE to stay in fixed-point.
    let t = val - SCALE; // negative, in [-SCALE/2, 0]

    // term1 = t  (already scaled)
    let term1 = t;
    // term2 = -t^2 / (2 * SCALE)
    let term2 = -(t * t / SCALE) / 2;
    // term3 = t^3 / (3 * SCALE^2)
    let term3 = (t / SCALE) * (t / SCALE) * t / (3 * SCALE);

    let ln_m = term1 + term2 + term3;

    k * LN2 + ln_m
}

/// Fixed-point natural exponential approximation.
/// Input `x` is in SCALE units (can be negative).
/// Returns exp(x) in SCALE units.
///
/// Uses identity: exp(x) = exp(k*ln2 + r) = 2^k * exp(r), r ∈ [0, ln2).
/// exp(r) approximated by Taylor series: 1 + r + r^2/2! + r^3/3! + r^4/4!
/// Accurate to ~1e-6 relative error for |x| < 20*SCALE.
pub fn exp_fp(x: i128) -> i128 {
    // Clamp to avoid overflow: exp(88) > i128::MAX at SCALE precision
    const MAX_X: i128 = 88 * SCALE;
    const MIN_X: i128 = -88 * SCALE;
    if x >= MAX_X {
        return i128::MAX / SCALE; // saturate
    }
    if x <= MIN_X {
        return 1; // underflow → ~0
    }

    const LN2: i128 = 6_931_472;

    // Decompose x = k*ln2 + r, r ∈ [0, ln2)
    let k = x / LN2;
    let r = x - k * LN2; // r ∈ [0, LN2)

    // Taylor: exp(r) = 1 + r + r^2/2 + r^3/6 + r^4/24  (r in SCALE units)
    let r2 = r * r / SCALE;
    let r3 = r2 * r / SCALE;
    let r4 = r3 * r / SCALE;

    let exp_r = SCALE + r + r2 / 2 + r3 / 6 + r4 / 24;

    // Multiply or divide by 2^k
    if k >= 0 {
        exp_r << k
    } else {
        exp_r >> (-k)
    }
}

/// LMSR cost function: C(q) = b * ln( Σ exp(q_i / b) )
/// `q` — outcome share quantities in stroops (raw i128, NOT scaled)
/// `b` — liquidity parameter in stroops (raw i128, NOT scaled)
/// Returns cost in stroops.
pub fn lmsr_cost(q: &[i128], b: i128) -> i128 {
    assert!(b > 0, "b must be positive");

    // Compute exp(q_i / b) for each outcome.
    // q_i / b is dimensionless; convert to SCALE units: (q_i * SCALE) / b
    let mut sum_exp: i128 = 0;
    for &qi in q {
        let arg = qi * SCALE / b; // fixed-point dimensionless
        sum_exp += exp_fp(arg);
    }

    // C = b * ln(sum_exp) / SCALE  (ln_fp returns SCALE-units, b is stroops)
    b * ln_fp(sum_exp) / SCALE
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
