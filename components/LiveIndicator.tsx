interface LiveIndicatorProps {
  isLive: boolean;
  loading?: boolean;
  compact?: boolean;
}

export function LiveIndicator({
  isLive,
  loading = false,
  compact = false,
}: LiveIndicatorProps) {
  const label = loading ? "Syncing" : isLive ? "Live" : "Offline";
  const dotColor = loading
    ? "bg-zinc-500"
    : isLive
      ? "bg-emerald-400"
      : "bg-amber-400";
  const textColor = loading
    ? "text-zinc-500"
    : isLive
      ? "text-emerald-400"
      : "text-amber-400";

  return (
    <div
      className={`flex items-center gap-2 rounded-full border border-white/5 bg-[#111113] ${
        compact ? "px-2.5 py-1" : "px-3 py-1.5"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {!loading && isLive && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      <span className={`text-xs font-medium ${textColor}`}>{label}</span>
    </div>
  );
}
