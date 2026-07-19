"use client";

interface AllocationSegment {
  symbol: string;
  percent: number;
  color: string;
}

interface AllocationBarProps {
  segments: AllocationSegment[];
}

export function AllocationBar({ segments }: AllocationBarProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Allocation Split
      </p>

      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.symbol}
            style={{
              width: `${segment.percent}%`,
              backgroundColor: segment.color,
            }}
            className="first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.symbol} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300">
                {segment.symbol}
              </span>{" "}
              {segment.percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
