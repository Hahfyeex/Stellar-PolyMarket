/**
 * useIPFSMetadata
 *
 * Resolves rich market metadata stored on IPFS by CID using the Pinata SDK.
 *
 * Resolution flow:
 *  1. Call pinata.gateways.get(cid) with a 5-second AbortController timeout.
 *  2. If IPFS resolves successfully, return the parsed IPFSMetadata object.
 *  3. If the request times out (>5 s), fall back to any on-chain data provided
 *     by the caller (e.g. a description field already stored in the contract).
 *  4. If both IPFS and the on-chain fallback are unavailable, return null so
 *     the caller can render <MetadataUnavailable />.
 *
 * Caching:
 *  React Query with staleTime: Infinity means each CID is fetched at most once
 *  per session — content-addressed IPFS objects are immutable by definition.
 */
import { useQuery } from "@tanstack/react-query";
import { PinataSDK } from "pinata";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Expected JSON schema stored at the IPFS CID. */
export interface IPFSMetadata {
  description: string;
  category: string;
  sourceUrls: string[];
  creatorNotes: string;
}

/** Subset of on-chain data used as a fallback when IPFS is unreachable. */
export interface OnChainFallback {
  description?: string;
  category?: string;
}

/** Return shape of the hook. */
export interface UseIPFSMetadataResult {
  /** Resolved metadata (from IPFS or on-chain fallback), or null when unavailable. */
  metadata: IPFSMetadata | null;
  /** True while the fetch is in flight. */
  isLoading: boolean;
  /** True when resolution finished and metadata is null (both sources failed). */
  isUnavailable: boolean;
  /** Raw error from the last attempt, if any. */
  error: Error | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const IPFS_TIMEOUT_MS = 5_000;

// ─── Pinata client factory ────────────────────────────────────────────────────
// Exported so tests can override the factory via jest.mock.

export function createPinataClient() {
  return new PinataSDK({
    pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT ?? "",
    pinataGateway: process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "gateway.pinata.cloud",
  });
}

// ─── Core fetch logic (exported for unit-testing in isolation) ────────────────

/**
 * Fetches and parses JSON metadata from IPFS for the given CID.
 * Throws with message "IPFS_TIMEOUT" if the gateway does not respond within
 * IPFS_TIMEOUT_MS (5 s). Uses Promise.race so the timeout fires without
 * needing a separate AbortController.
 */
export async function fetchIPFSMetadata(cid: string): Promise<IPFSMetadata> {
  // Reject after IPFS_TIMEOUT_MS with a recognisable sentinel message.
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("IPFS_TIMEOUT")), IPFS_TIMEOUT_MS)
  );

  const pinata = createPinataClient();
  // Race the gateway fetch against the timeout.
  const raw = (await Promise.race([
    pinata.gateways.get(cid),
    timeoutPromise,
  ])) as unknown;

  // If the SDK returned a string, parse it; otherwise assume it is already
  // an object (the SDK may auto-parse application/json responses).
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Validate the required shape; throw if key fields are missing.
  if (!isIPFSMetadata(parsed)) {
    throw new Error("IPFS response does not match expected metadata schema");
  }

  return parsed;
}

/** Runtime type-guard for IPFSMetadata. */
function isIPFSMetadata(value: unknown): value is IPFSMetadata {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.description === "string" &&
    typeof v.category === "string" &&
    Array.isArray(v.sourceUrls) &&
    typeof v.creatorNotes === "string"
  );
}

/** Converts an OnChainFallback into a minimal IPFSMetadata object. */
function onChainToMetadata(fallback: OnChainFallback): IPFSMetadata {
  return {
    description: fallback.description ?? "",
    category: fallback.category ?? "",
    sourceUrls: [],
    creatorNotes: "",
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * @param cid       - IPFS Content Identifier for the market's metadata JSON.
 * @param onChain   - Optional on-chain data used as a fallback on IPFS timeout.
 *
 * @example
 * const { metadata, isLoading, isUnavailable } = useIPFSMetadata(market.cid, {
 *   description: market.description,
 *   category: market.category,
 * });
 */
export function useIPFSMetadata(
  cid: string | null | undefined,
  onChain?: OnChainFallback
): UseIPFSMetadataResult {
  const { data, isLoading, error } = useQuery<IPFSMetadata | null, Error>({
    // Each unique CID gets its own cache entry — fetched at most once per session.
    queryKey: ["ipfs-metadata", cid],

    queryFn: async () => {
      // cid is guaranteed truthy here because enabled: Boolean(cid) guards above.
      try {
        // Attempt IPFS resolution first.
        return await fetchIPFSMetadata(cid!);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        // On timeout, fall back to whatever on-chain data was supplied.
        if (message === "IPFS_TIMEOUT" && onChain) {
          return onChainToMetadata(onChain);
        }

        // Any other error — return null so the UI renders MetadataUnavailable.
        return null;
      }
    },

    // CID-addressed content is immutable; never mark it stale or refetch.
    staleTime: Infinity,

    // Only run the query when a CID is present.
    enabled: Boolean(cid),
  });

  const metadata = data ?? null;

  return {
    metadata,
    isLoading,
    // isUnavailable is true only after the query has settled with no data.
    isUnavailable: !isLoading && metadata === null,
    error: error ?? null,
  };
}
