"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MarketDetailPage from "./MarketDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000,
      staleTime: 1000,
    },
  },
});

export default function MarketPageClient({ marketId }: { marketId: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MarketDetailPage marketId={marketId} />
    </QueryClientProvider>
  );
}
