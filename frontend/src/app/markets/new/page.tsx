"use client";

import { useRouter } from "next/navigation";
import CreateMarketForm from "../../../components/CreateMarketForm";

export default function CreateMarketPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_38%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] px-4 py-10 md:px-6">
      <div className="mx-auto max-w-4xl">
        <CreateMarketForm onCreated={(marketId) => router.push(`/markets/${marketId}`)} />
      </div>
    </main>
  );
}
