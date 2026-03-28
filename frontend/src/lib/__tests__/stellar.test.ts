import { validateStellarAddress } from '../stellar';

describe('validateStellarAddress', () => {
  it('should accept valid Stellar public key', () => {
    const validAddress = 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ';
    expect(validateStellarAddress(validAddress)).toBe(true);
  });

  it('should reject empty string', () => {
    expect(validateStellarAddress('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(validateStellarAddress(null as any)).toBe(false);
    expect(validateStellarAddress(undefined as any)).toBe(false);
  });

  it('should reject address with wrong length', () => {
    expect(validateStellarAddress('GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXW')).toBe(false);
    expect(validateStellarAddress('GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQQ')).toBe(false);
  });

  it('should reject address not starting with G', () => {
    expect(validateStellarAddress('ABRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ')).toBe(false);
  });

  it('should reject invalid checksum', () => {
    expect(validateStellarAddress('GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWX')).toBe(false);
  });

  it('should reject address with special characters', () => {
    expect(validateStellarAddress('GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXW!')).toBe(false);
  });
});
