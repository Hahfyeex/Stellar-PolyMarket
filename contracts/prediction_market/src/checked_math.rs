/// checked_math.rs — Overflow-safe arithmetic helpers for the prediction market contract.
///
/// Every monetary calculation (pool balances, payouts, fees, LMSR costs) goes through
/// these wrappers. On overflow the contract panics with a descriptive message rather
/// than silently wrapping, which would produce incorrect payouts or enable pool-drain
/// exploits.
///
/// # Zero-Float Policy
/// All values are i128 in stroops (7-decimal fixed-point). No floats anywhere.
///
/// # Usage
/// ```ignore
/// use crate::checked_math::{cadd, csub, cmul, cdiv};
/// let payout = cdiv(cmul(stake, payout_pool, "payout mul"), winning_stake, "payout div");
/// ```

/// Checked addition. Panics with context on overflow.
#[inline(always)]
pub fn cadd(a: i128, b: i128, ctx: &str) -> i128 {
    a.checked_add(b)
        .unwrap_or_else(|| panic!("arithmetic overflow in {}: add {} + {}", ctx, a, b))
}

/// Checked subtraction. Panics with context on underflow.
#[inline(always)]
pub fn csub(a: i128, b: i128, ctx: &str) -> i128 {
    a.checked_sub(b)
        .unwrap_or_else(|| panic!("arithmetic overflow in {}: sub {} - {}", ctx, a, b))
}

/// Checked multiplication. Panics with context on overflow.
#[inline(always)]
pub fn cmul(a: i128, b: i128, ctx: &str) -> i128 {
    a.checked_mul(b)
        .unwrap_or_else(|| panic!("arithmetic overflow in {}: mul {} * {}", ctx, a, b))
}

/// Checked division. Panics with context on divide-by-zero or overflow.
#[inline(always)]
pub fn cdiv(a: i128, b: i128, ctx: &str) -> i128 {
    a.checked_div(b)
        .unwrap_or_else(|| panic!("arithmetic overflow in {}: div {} / {}", ctx, a, b))
}

/// Checked multiply-then-divide: (a * b) / c — the most common payout pattern.
/// Intermediate product uses checked_mul to catch overflow before the division.
#[inline(always)]
pub fn cmuldiv(a: i128, b: i128, c: i128, ctx: &str) -> i128 {
    let product = cmul(a, b, ctx);
    cdiv(product, c, ctx)
}
