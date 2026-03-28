import { StrKey } from '@stellar/stellar-sdk';

/**
 * Validates if a string is a valid Stellar public key address.
 * 
 * Checks:
 * - Length is exactly 56 characters
 * - Starts with 'G'
 * - Passes Stellar SDK StrKey validation
 * 
 * @param address - The address string to validate
 * @returns true if valid Stellar address, false otherwise
 */
export function validateStellarAddress(address: string): boolean {
  if (!address) return false;
  if (address.length !== 56) return false;
  if (!address.startsWith('G')) return false;
  
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}
