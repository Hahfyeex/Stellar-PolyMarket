"use client";

import { useEffect, useMemo, useState } from "react";
import { buildReferralLink, generateReferralCode } from "../lib/referral";
import { useToast } from "./ToastProvider";

interface ReferralSectionProps {
  walletAddress: string;
  referredUsers: number;
  totalBonusEarned: number;
}

function formatBonusXlm(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} XLM`;
}

export default function ReferralSection({
  walletAddress,
  referredUsers,
  totalBonusEarned,
}: ReferralSectionProps) {
  const { success, error } = useToast();
  const [copied, setCopied] = useState(false);

  const referralCode = useMemo(() => generateReferralCode(walletAddress), [walletAddress]);
  const referralLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return buildReferralLink(window.location.origin, walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    if (!copied) return undefined;

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopyReferralLink() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      success("Referral link copied to clipboard.");
    } catch (copyError) {
      error(
        copyError instanceof Error ? copyError.message : "Could not copy referral link."
      );
    }
  }

  return (
    <section className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/40 p-6 shadow-xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">
              Referral
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Invite traders, earn bonuses</h2>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-400">Referral code</p>
            <div className="inline-flex items-center rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 font-mono text-lg tracking-[0.24em] text-indigo-100">
              {referralCode}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-400">Referral link</p>
            <p className="break-all rounded-2xl border border-gray-800 bg-gray-950/80 px-4 py-3 text-sm text-gray-200">
              {referralLink || "Connect from the browser to generate your referral link."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyReferralLink}
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            {copied ? "Referral Link Copied" : "Copy Referral Link"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:min-w-[264px]">
          <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Referred Users
            </p>
            <p className="mt-2 text-3xl font-semibold text-white tabular-nums">{referredUsers}</p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Bonus Earned
            </p>
            <p className="mt-2 text-3xl font-semibold text-green-400 tabular-nums">
              {formatBonusXlm(totalBonusEarned)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
