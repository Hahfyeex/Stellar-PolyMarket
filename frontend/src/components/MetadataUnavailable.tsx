/**
 * MetadataUnavailable
 *
 * Placeholder rendered when market metadata cannot be retrieved from either
 * IPFS or the on-chain fallback. Designed to degrade gracefully — it occupies
 * the same layout space as the metadata panel without breaking surrounding UI.
 */

interface MetadataUnavailableProps {
  /** Optional message shown below the default copy. */
  message?: string;
  /** Additional CSS class names for the container. */
  className?: string;
}

export default function MetadataUnavailable({
  message,
  className = "",
}: MetadataUnavailableProps) {
  return (
    <div
      role="status"
      aria-label="Market metadata unavailable"
      data-testid="metadata-unavailable"
      className={`rounded-lg border border-dashed border-gray-600 bg-gray-900/40 px-6 py-8 text-center ${className}`}
    >
      {/* Icon */}
      <div className="mb-3 text-3xl" aria-hidden="true">
        ⚠️
      </div>

      {/* Heading */}
      <p className="text-sm font-semibold text-gray-300">
        Market metadata unavailable
      </p>

      {/* Default explanation */}
      <p className="mt-1 text-xs text-gray-500">
        Could not retrieve metadata from IPFS or on-chain sources. The market
        may still be active — check back later.
      </p>

      {/* Optional caller-supplied detail */}
      {message && (
        <p className="mt-2 text-xs text-gray-400" data-testid="metadata-unavailable-message">
          {message}
        </p>
      )}
    </div>
  );
}
