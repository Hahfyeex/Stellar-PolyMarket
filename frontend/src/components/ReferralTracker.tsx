"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { persistReferralCode, REFERRAL_QUERY_PARAM } from "../lib/referral";

export default function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    persistReferralCode(searchParams.get(REFERRAL_QUERY_PARAM));
  }, [searchParams]);

  return null;
}
