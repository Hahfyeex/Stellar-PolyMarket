"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../hooks/useWallet";
import type { Market } from "../types/market";

// Mock/Constant for admin address - in production this comes from env
const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "GBADMIN...";

async function fetchProposedMarkets(): Promise<Market[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets?status=PROPOSED`);
  if (!res.ok) throw new Error("Failed to fetch proposed markets");
  return res.json();
}

async function approveMarket(marketId: number) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}/resolve`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to approve market");
  }
  return res.json();
}

async function disputeMarket({ marketId, reason }: { marketId: number; reason: string }) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}/dispute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to dispute market");
  }
  return res.json();
}

export default function ResolutionCenter() {
  const { publicKey } = useWallet();
  const connected = !!publicKey;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [disputeModal, setDisputeModal] = useState<{ id: number; reason: string } | null>(null);

  // 1. Admin Access Control
  useEffect(() => {
    if (connected && publicKey && publicKey !== ADMIN_ADDRESS) {
      alert("Permission Denied: Admin access only");
      router.push("/");
    }
  }, [connected, publicKey, router]);

  // 2. Data Fetching
  const { data: markets, isLoading, error } = useQuery({
    queryKey: ["markets", "proposed"],
    queryFn: fetchProposedMarkets,
    refetchInterval: 30000,
    enabled: publicKey === ADMIN_ADDRESS,
  });

  // 3. Mutations
  const approveMutation = useMutation({
    mutationFn: approveMarket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets", "proposed"] });
      alert("Market approved and resolved on-chain!");
    },
    onError: (err) => alert(`Approval Error: ${err.message}`),
  });

  const disputeMutation = useMutation({
    mutationFn: disputeMarket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets", "proposed"] });
      setDisputeModal(null);
      alert("Market disputed successfully!");
    },
    onError: (err) => alert(`Dispute Error: ${err.message}`),
  });

  if (!connected || publicKey !== ADMIN_ADDRESS) {
    return (
      <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800">
        <h2 className="text-xl font-bold text-white">Admin Access Required</h2>
        <p className="mt-2 text-slate-400">Please connect the administrator wallet to continue.</p>
      </div>
    );
  }

  if (isLoading) return <div className="p-8 text-center text-white">Loading proposed markets...</div>;
  if (error) return <div className="p-8 text-center text-red-400">Error: {error.message}</div>;

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white">Resolution Center</h2>
          <p className="text-slate-400">Review and resolve markets with proposed outcomes.</p>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full text-xs text-cyan-400 font-medium">
          Admin: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
        </div>
      </div>

      <div className="grid gap-4">
        {markets?.length === 0 && (
          <div className="p-12 text-center bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
            <p className="text-slate-500">No markets currently awaiting resolution.</p>
          </div>
        )}
        
        {markets?.map((market) => (
          <div key={market.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:border-slate-700">
            <div className="flex-1 space-y-2">
              <h3 className="text-lg font-semibold text-white">{market.question}</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="text-slate-400">
                  Proposed: <span className="text-emerald-400 font-medium">{market.outcomes[market.proposed_outcome ?? 0] || "Unknown"}</span>
                </div>
                <div className="text-slate-400">
                  Pool: <span className="text-white">{market.total_pool} XLM</span>
                </div>
                <div className="text-slate-400">
                  ID: <span className="font-mono">{market.id}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to approve this resolution? This will trigger on-chain settlement.")) {
                    approveMutation.mutate(market.id);
                  }
                }}
                disabled={approveMutation.isPending}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-white font-bold transition-colors"
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={() => setDisputeModal({ id: market.id, reason: "" })}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition-colors border border-slate-700"
              >
                Dispute
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Dispute Modal */}
      {disputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-white">Dispute Resolution</h3>
            <p className="mt-1 text-sm text-slate-400">Provide a reason for contesting the proposed outcome.</p>
            
            <textarea
              className="mt-4 w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm outline-none focus:border-amber-500 transition-colors"
              placeholder="Enter dispute reason..."
              value={disputeModal.reason}
              onChange={(e) => setDisputeModal({ ...disputeModal, reason: e.target.value })}
            />

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => disputeMutation.mutate({ marketId: disputeModal.id, reason: disputeModal.reason })}
                disabled={!disputeModal.reason || disputeMutation.isPending}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-colors"
              >
                {disputeMutation.isPending ? "Submitting..." : "Submit Dispute"}
              </button>
              <button
                onClick={() => setDisputeModal(null)}
                className="px-6 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
