/**
 * useCouncilMember
 *
 * Checks whether the connected wallet is a Stellar Council member.
 * Council membership is determined by querying the backend allowlist.
 *
 * Returns:
 *   - isCouncilMember: true if the wallet is on the council allowlist
 *   - loading: true while the check is in flight
 *   - error: error message if the check fails
 */
import { useState, useEffect } from "react";

export function useCouncilMember(publicKey: string | null) {
  const [isCouncilMember, setIsCouncilMember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setIsCouncilMember(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/governance/council/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: publicKey }),
    })
      .then((res) => res.json())
      .then((data) => setIsCouncilMember(data.isMember === true))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [publicKey]);

  return { isCouncilMember, loading, error };
}
