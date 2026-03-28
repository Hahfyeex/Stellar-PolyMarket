"use client";

/**
 * ReactQueryProvider
 *
 * Wraps the app with TanStack Query's QueryClientProvider so any hook
 * using useQuery / useIPFSMetadata can share the same in-memory cache.
 *
 * Must be a Client Component because QueryClient holds mutable state.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  // Create the QueryClient once per mount so each SSR request gets its own
  // instance (prevents state leaking between users in server environments).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // IPFS content addressed by CID is immutable — never refetch.
            staleTime: Infinity,
            retry: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
