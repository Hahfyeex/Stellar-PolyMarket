/// Fixed-point LMSR (Logarithmic Market Scoring Rule) math.
///
/// All values use 7-decimal precision: SCALE = 10_000_000 (1.0 = 10_000_000).
/// No floats anywhere — only i128 arithmetic with checked_* operations.
///
/// LMSR cost function:  C(q) = b * ln( Σ exp(q_i / b) )
/// Price of outcome i:  p_i  = exp(q_i / b) / Σ exp(q_j / b)
/// Cost to move shares: ΔC   = C(q_after) - C(q_before)

use crate::checked_math::{cadd, csub, cmul, cdiv};

pub const SCALE: i128 = 10_000_000; // 1.0 in fixed-point

pub fn ln_fp(x: i128) -> i128 {
    assert!(x > 0, "ln undefined for x <= 0");
    if x == SCALE {
        return 0;
    }

    const LN2: i128 = 6_931_472;

    let mut val = x;
    let mut k: i128 = 0;

    while val < 7_071_068 {
        val <<= 1;
        k = csub(k, 1, "ln_fp k decrement");
    }
    while val > 14_142_136 {
        val >>= 1;
        k = cadd(k, 1, "ln_fp k increment");
    }

    let t = csub(val, SCALE, "ln_fp t");
    if t == 0 {
        return cmul(k, LN2, "ln_fp k*ln2");
    }

    let t2 = cdiv(cmul(t, t, "ln t2"), SCALE, "ln t2 scale");
    let t3 = cdiv(cmul(t2, t, "ln t3"), SCALE, "ln t3 scale");
    let t4 = cdiv(cmul(t3, t, "ln t4"), SCALE, "ln t4 scale");
    let t5 = cdiv(cmul(t4, t, "ln t5"), SCALE, "ln t5 scale");
    let t6 = cdiv(cmul(t5, t, "ln t6"), SCALE, "ln t6 scale");
    let t7 = cdiv(cmul(t6, t, "ln t7"), SCALE, "ln t7 scale");
    let t8 = cdiv(cmul(t7, t, "ln t8"), SCALE, "ln t8 scale");

    // ln(1+t) ≈ t - t²/2 + t³/3 - t⁴/4 + t⁵/5 - t⁶/6 + t⁷/7 - t⁸/8
    let ln_m = t
        .checked_sub(t2 / 2).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term2"))
        .checked_add(t3 / 3).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term3"))
        .checked_sub(t4 / 4).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term4"))
        .checked_add(t5 / 5).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term5"))
        .checked_sub(t6 / 6).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term6"))
        .checked_add(t7 / 7).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term7"))
        .checked_sub(t8 / 8).unwrap_or_else(|| panic!("arithmetic overflow in ln_fp term8"));

    cadd(cmul(k, LN2, "ln_fp k*ln2"), ln_m, "ln_fp result")
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

    let mut k = x / LN2;
    let mut r = x % LN2;
    if r < 0 {
        r = cadd(r, LN2, "exp_fp r adjust");
        k = csub(k, 1, "exp_fp k adjust");
    }

    let r2 = cdiv(cmul(r, r, "exp r2"), SCALE, "exp r2 scale");
    let r3 = cdiv(cmul(r2, r, "exp r3"), SCALE, "exp r3 scale");
    let r4 = cdiv(cmul(r3, r, "exp r4"), SCALE, "exp r4 scale");
    let r5 = cdiv(cmul(r4, r, "exp r5"), SCALE, "exp r5 scale");

    // exp(r) = 1 + r + r²/2 + r³/6 + r⁴/24 + r⁵/120
    let exp_r = SCALE
        .checked_add(r).unwrap_or_else(|| panic!("arithmetic overflow in exp_fp r"))
        .checked_add(r2 / 2).unwrap_or_else(|| panic!("arithmetic overflow in exp_fp r2"))
        .checked_add(r3 / 6).unwrap_or_else(|| panic!("arithmetic overflow in exp_fp r3"))
        .checked_add(r4 / 24).unwrap_or_else(|| panic!("arithmetic overflow in exp_fp r4"))
        .checked_add(r5 / 120).unwrap_or_else(|| panic!("arithmetic overflow in exp_fp r5"));

    if k >= 0 {
        if k > 60 { return i128::MAX / SCALE; }
        exp_r.checked_shl(k as u32).unwrap_or(i128::MAX / SCALE)
    } else {
        if k < -60 { return 0; }
        exp_r >> (-k)
    }
}

/// LMSR cost function: C(q) = b * ln( Σ exp(q_i / b) )
pub fn lmsr_cost(q: &[i128], b: i128) -> i128 {
    assert!(b > 0, "b must be positive");

    let mut q_max = q[0];
    for &qi in q {
        if qi > q_max { q_max = qi; }
    }

    let mut sum_exp: i128 = 0;
    for &qi in q {
        let arg = cdiv(cmul(csub(qi, q_max, "lmsr arg sub"), SCALE, "lmsr arg mul"), b, "lmsr arg div");
        sum_exp = cadd(sum_exp, exp_fp(arg), "lmsr sum_exp");
    }

    cadd(q_max, cdiv(cmul(b, ln_fp(sum_exp), "lmsr b*ln"), SCALE, "lmsr cost scale"), "lmsr cost")
}

/// Price of outcome `i`: p_i = exp(q_i/b) / Σ exp(q_j/b)
pub fn lmsr_price(q: &[i128], b: i128, i: usize) -> i128 {
    assert!(b > 0, "b must be positive");
    assert!(i < q.len(), "index out of range");

    let mut sum_exp: i128 = 0;
    let mut exp_i: i128 = 0;
    for (j, &qj) in q.iter().enumerate() {
        let e = exp_fp(cdiv(cmul(qj, SCALE, "price exp mul"), b, "price exp div"));
        sum_exp = cadd(sum_exp, e, "price sum_exp");
        if j == i { exp_i = e; }
    }

    cdiv(cmul(exp_i, SCALE, "price numerator"), sum_exp, "price")
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
