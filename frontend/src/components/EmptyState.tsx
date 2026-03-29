type EmptyStateProps = {
  illustration?: React.ReactNode;
  title?: string;
  message: string;
  ctaLabel?: string;
  onClick?: () => void;
};

export default function EmptyState({
  illustration,
  title,
  message,
  ctaLabel,
  onClick,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-4 rounded-2xl border border-gray-800 bg-gray-900/40">
      <div className="flex items-center justify-center">
        {illustration ?? <span className="text-3xl">📭</span>}
      </div>

      <div className="space-y-2">
        {title ? <h3 className="text-xl font-semibold text-white">{title}</h3> : null}
        <p className="text-gray-400 max-w-md">{message}</p>
      </div>

      {ctaLabel && onClick ? (
        <button
          onClick={onClick}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
