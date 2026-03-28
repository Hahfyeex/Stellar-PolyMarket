"use client";

import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MarketDetailPage from "../../market/[id]/MarketDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000,
      staleTime: 1000,
    },
  },
});

export default function MarketsAliasPage() {
  const params = useParams();
  const marketId = params.id as string;

  return (
    <QueryClientProvider client={queryClient}>
      <MarketDetailPage marketId={marketId} />
    </QueryClientProvider>
  );
}
