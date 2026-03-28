"use client";

import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MarketDetailPage from "./MarketDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000, // Poll for live pool updates
      staleTime: 1000,
    },
  },
});

export default function MarketPage() {
  const params = useParams();
  const marketId = params.id as string;

  return (
    <QueryClientProvider client={queryClient}>
      <MarketDetailPage marketId={marketId} />
    </QueryClientProvider>
  );
}
