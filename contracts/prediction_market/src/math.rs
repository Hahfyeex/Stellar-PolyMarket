/// math::scalar — Modular reduction for ZK scalar field inputs.
///
/// BN254 (alt_bn128) scalar field prime:
///   r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
///
/// Any scalar value s must satisfy 0 <= s < r before use in equality checks.
/// Without normalization, a prover can supply s + r (or s + k*r) and bypass
/// equality checks that compare raw bytes, breaking ZK soundness.
///
/// # No-std / no-float guarantee
/// All arithmetic uses u128 limbs only. No floats, no std.
///
/// # Algorithm
/// Represent the 256-bit input as four 64-bit limbs [lo0, lo1, hi0, hi1]
/// (little-endian 64-bit words). Perform multi-precision subtraction of r
/// until the value is in [0, r). This is correct because valid ZK scalars
/// are at most one or two multiples of r above the canonical range.
/// For arbitrary 256-bit inputs we do a full conditional-subtract loop
/// (at most 2^128 / r iterations — bounded to 4 subtractions in practice
/// since inputs come from a 256-bit field).

// BN254 scalar field prime r as four little-endian 64-bit limbs:
//   r = 0x30644e72e131a029b85045b68181585d2833e84879b9709142e0f353d9d864fd
//       (big-endian hex, split into 64-bit words little-endian)
//
// Limb layout: [limb0 (bits 0-63), limb1 (bits 64-127), limb2 (bits 128-191), limb3 (bits 192-255)]
const R: [u64; 4] = [
    0x43e1f593f0000001, // limb0
    0x2833e84879b97091, // limb1
    0xb85045b68181585d, // limb2
    0x30644e72e131a029, // limb3
];

/// Decode a big-endian 32-byte array into four little-endian 64-bit limbs.
fn bytes_to_limbs(b: &[u8; 32]) -> [u64; 4] {
    // BytesN<32> is big-endian; limb0 = least-significant 8 bytes (b[24..32])
    let limb0 = u64::from_be_bytes([b[24], b[25], b[26], b[27], b[28], b[29], b[30], b[31]]);
    let limb1 = u64::from_be_bytes([b[16], b[17], b[18], b[19], b[20], b[21], b[22], b[23]]);
    let limb2 = u64::from_be_bytes([b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]]);
    let limb3 = u64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]);
    [limb0, limb1, limb2, limb3]
}

/// Encode four little-endian 64-bit limbs back to a big-endian 32-byte array.
fn limbs_to_bytes(limbs: &[u64; 4]) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[0..8].copy_from_slice(&limbs[3].to_be_bytes());
    out[8..16].copy_from_slice(&limbs[2].to_be_bytes());
    out[16..24].copy_from_slice(&limbs[1].to_be_bytes());
    out[24..32].copy_from_slice(&limbs[0].to_be_bytes());
    out
}

/// Returns true if `a >= b` (both 4-limb little-endian u64 arrays).
fn gte(a: &[u64; 4], b: &[u64; 4]) -> bool {
    // Compare from most-significant limb down
    for i in (0..4).rev() {
        if a[i] > b[i] {
            return true;
        }
        if a[i] < b[i] {
            return false;
        }
    }
    true // equal
}

/// Subtract b from a in-place (a -= b). Assumes a >= b.
fn sub_assign(a: &mut [u64; 4], b: &[u64; 4]) {
    let mut borrow: u64 = 0;
    for i in 0..4 {
        let (diff, b1) = a[i].overflowing_sub(b[i]);
        let (diff, b2) = diff.overflowing_sub(borrow);
        borrow = (b1 || b2) as u64;
        a[i] = diff;
    }
}

/// Reduce a 256-bit value modulo the BN254 scalar field prime r.
///
/// Performs repeated subtraction of r while value >= r.
/// For inputs from a 256-bit field this terminates in at most a handful
/// of iterations (the excess above r is small relative to 2^256).
fn reduce(mut limbs: [u64; 4]) -> [u64; 4] {
    while gte(&limbs, &R) {
        sub_assign(&mut limbs, &R);
    }
    limbs
}

/// Normalize a 32-byte scalar to the canonical range [0, r).
///
/// # Arguments
/// * `input` — raw 32-byte scalar (big-endian), potentially >= r
///
/// # Returns
/// The canonical representative `input mod r` as a 32-byte big-endian array.
///
/// # Usage in verify_proof
/// Call this on every scalar witness/input before any equality check:
/// ```ignore
/// let s_norm = normalize_scalar(raw_scalar);
/// assert_eq!(s_norm, expected_scalar);
/// ```
pub fn normalize_scalar(input: [u8; 32]) -> [u8; 32] {
    let limbs = bytes_to_limbs(&input);
    let reduced = reduce(limbs);
    limbs_to_bytes(&reduced)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// r as a big-endian 32-byte array (canonical form of the prime itself)
    const R_BYTES: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
        0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
    ];

    fn r_plus(k: u64) -> [u8; 32] {
        // Compute r + k by adding k to the least-significant limb
        let mut limbs = bytes_to_limbs(&R_BYTES);
        let (new_lo, carry) = limbs[0].overflowing_add(k);
        limbs[0] = new_lo;
        if carry {
            limbs[1] = limbs[1].wrapping_add(1);
        }
        limbs_to_bytes(&limbs)
    }

    #[test]
    fn zero_stays_zero() {
        assert_eq!(normalize_scalar([0u8; 32]), [0u8; 32]);
    }

    #[test]
    fn one_stays_one() {
        let mut one = [0u8; 32];
        one[31] = 1;
        assert_eq!(normalize_scalar(one), one);
    }

    #[test]
    fn r_minus_one_is_unchanged() {
        // r - 1 is the largest valid scalar; must be returned as-is
        let mut r_minus_one = R_BYTES;
        // subtract 1 from least-significant byte
        let mut i = 31usize;
        loop {
            if r_minus_one[i] > 0 {
                r_minus_one[i] -= 1;
                break;
            }
            r_minus_one[i] = 0xff;
            i -= 1;
        }
        assert_eq!(normalize_scalar(r_minus_one), r_minus_one);
    }

    #[test]
    fn r_reduces_to_zero() {
        // r mod r == 0
        assert_eq!(normalize_scalar(R_BYTES), [0u8; 32]);
    }

    #[test]
    fn r_plus_one_reduces_to_one() {
        let mut one = [0u8; 32];
        one[31] = 1;
        assert_eq!(normalize_scalar(r_plus(1)), one);
    }

    #[test]
    fn r_plus_k_reduces_correctly() {
        // r + 42 mod r == 42
        let mut expected = [0u8; 32];
        expected[31] = 42;
        assert_eq!(normalize_scalar(r_plus(42)), expected);
    }

    #[test]
    fn two_r_reduces_to_zero() {
        // 2r mod r == 0
        let two_r = r_plus_n_r(2);
        assert_eq!(normalize_scalar(two_r), [0u8; 32]);
    }

    #[test]
    fn max_u256_reduces_to_correct_value() {
        // 2^256 - 1 mod r — just verify it's in [0, r)
        let max = [0xffu8; 32];
        let result = normalize_scalar(max);
        // result must be < r
        let result_limbs = bytes_to_limbs(&result);
        assert!(!gte(&result_limbs, &R));
    }

    #[test]
    fn idempotent_already_reduced() {
        // Normalizing an already-reduced value is a no-op
        let mut val = [0u8; 32];
        val[31] = 0xab;
        let once = normalize_scalar(val);
        let twice = normalize_scalar(once);
        assert_eq!(once, twice);
    }

    #[test]
    fn output_always_in_range() {
        // Spot-check a range of inputs
        let test_cases: &[[u8; 32]] = &[
            [0u8; 32],
            { let mut b = [0u8; 32]; b[31] = 1; b },
            R_BYTES,
            r_plus(1),
            r_plus(u64::MAX / 2),
            [0xffu8; 32],
        ];
        for &input in test_cases {
            let result = normalize_scalar(input);
            let limbs = bytes_to_limbs(&result);
            assert!(!gte(&limbs, &R), "result >= r for input {:?}", input);
        }
    }

    /// Helper: compute n*r as 32-byte big-endian (for small n)
    fn r_plus_n_r(n: u64) -> [u8; 32] {
        // n * r via repeated addition of R_BYTES limbs
        let r_limbs = bytes_to_limbs(&R_BYTES);
        let mut acc = [0u64; 4];
        for _ in 0..n {
            let mut carry: u128 = 0;
            for i in 0..4 {
                let sum = acc[i] as u128 + r_limbs[i] as u128 + carry;
                acc[i] = sum as u64;
                carry = sum >> 64;
            }
        }
        limbs_to_bytes(&acc)
    }
}
