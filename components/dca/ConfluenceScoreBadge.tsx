"use client";

import { LiveMetricSkeleton, LiveMetricUnavailable } from "@/components/dca/LiveState";
import { confluenceTone } from "@/lib/dca/terminal";

interface ConfluenceScoreBadgeProps {
  score: number;
  ready: boolean;
  loading?: boolean;
}

export function ConfluenceScoreBadge({
  score,
  ready,
  loading = false,
}: ConfluenceScoreBadgeProps) {
  const size = 88;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const fill = Math.max(0, Math.min(100, score));
  const tone = confluenceTone(score);

  if (loading && !ready) {
    return (
      <div className="flex h-[88px] w-[88px] items-center justify-center">
        <LiveMetricSkeleton className="h-[88px] w-[88px] rounded-full" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border border-[#FF2A6D]/40 bg-black/40">
        <LiveMetricUnavailable label="CONFLUENCE" />
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`CONFLUENCE ${score} z 100, ${tone.label}`}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `0 0 22px ${tone.glow}, inset 0 0 18px rgba(0,0,0,0.65)`,
          background: "rgba(9, 11, 17, 0.82)",
          border: "1px solid rgba(255,255,255,0.05)",
          backdropFilter: "blur(12px)",
        }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.hex}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - fill / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${tone.hex})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Confluence
        </p>
        <p className="font-mono text-2xl font-black leading-none" style={{ color: tone.hex }}>
          {score}
        </p>
        <p className="font-mono text-[9px] font-semibold text-zinc-500">/100</p>
      </div>
    </div>
  );
}
