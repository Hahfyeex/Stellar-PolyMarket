"use client";

export const REFERRAL_QUERY_PARAM = "ref";
export const REFERRAL_STORAGE_KEY = "stella.referral.code";
export const REFERRAL_ATTRIBUTED_STORAGE_PREFIX = "stella.referral.attributed";

export interface ReferralStats {
  referredUsers: number;
  totalBonusEarned: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

interface BetRequestPayload {
  marketId: number;
  outcomeIndex: number;
  amount: number | string;
  walletAddress: string;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function generateReferralCode(walletAddress: string): string {
  const normalized = walletAddress.trim().toUpperCase();
  let hash = 2166136261;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const base36 = (hash >>> 0).toString(36).toUpperCase();
  return base36.padStart(8, "0").slice(0, 8);
}

export function normalizeReferralCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return /^[A-Z0-9]{8}$/.test(normalized) ? normalized : null;
}

export function persistReferralCode(
  code: string | null | undefined,
  storage?: StorageLike
): string | null {
  const normalized = normalizeReferralCode(code);
  const target = getStorage(storage);

  if (!normalized || !target) return null;

  target.setItem(REFERRAL_STORAGE_KEY, normalized);
  return normalized;
}

export function getStoredReferralCode(storage?: StorageLike): string | null {
  const target = getStorage(storage);
  if (!target) return null;
  return normalizeReferralCode(target.getItem(REFERRAL_STORAGE_KEY));
}

function attributedStorageKey(walletAddress: string): string {
  return `${REFERRAL_ATTRIBUTED_STORAGE_PREFIX}:${walletAddress.toUpperCase()}`;
}

export function hasAttributedReferral(walletAddress: string, storage?: StorageLike): boolean {
  const target = getStorage(storage);
  if (!target) return false;
  return target.getItem(attributedStorageKey(walletAddress)) === "true";
}

export function markReferralAttributed(walletAddress: string, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(attributedStorageKey(walletAddress), "true");
}

export function getReferralCodeForBet(
  walletAddress: string,
  storage?: StorageLike
): string | null {
  const storedCode = getStoredReferralCode(storage);
  if (!storedCode) return null;
  if (storedCode === generateReferralCode(walletAddress)) return null;
  if (hasAttributedReferral(walletAddress, storage)) return null;
  return storedCode;
}

export function buildBetRequestBody(
  payload: BetRequestPayload,
  storage?: StorageLike
): BetRequestPayload & { referralCode?: string } {
  const referralCode = getReferralCodeForBet(payload.walletAddress, storage);
  return referralCode ? { ...payload, referralCode } : payload;
}

export function finalizeReferralAttribution(walletAddress: string, storage?: StorageLike): void {
  if (getReferralCodeForBet(walletAddress, storage)) {
    markReferralAttributed(walletAddress, storage);
  }
}

export function buildReferralLink(origin: string, walletAddress: string): string {
  const url = new URL("/", origin);
  url.searchParams.set(REFERRAL_QUERY_PARAM, generateReferralCode(walletAddress));
  return url.toString();
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeReferralStats(data: any): ReferralStats {
  const referral = data?.referral ?? data?.referrals ?? null;

  return {
    referredUsers: toNumber(
      data?.referred_users ??
        data?.referredUsers ??
        data?.referral_count ??
        data?.referralCount ??
        referral?.referred_users ??
        referral?.referredUsers ??
        referral?.count
    ),
    totalBonusEarned: toNumber(
      data?.referral_bonus_earned ??
        data?.referralBonusEarned ??
        data?.total_referral_bonus_earned ??
        data?.totalReferralBonusEarned ??
        referral?.bonus_earned ??
        referral?.bonusEarned ??
        referral?.totalBonusEarned
    ),
  };
}
