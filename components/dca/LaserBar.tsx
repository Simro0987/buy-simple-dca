"use client";

import { hexToRgba } from "@/lib/dca/heatmap";

interface LaserSegment {
  width: number;
  tone?: "approved" | "amber" | "orange" | "violet" | "fuchsia" | "stopped" | "mute";
  color?: string;
}

const toneClass: Record<NonNullable<LaserSegment["tone"]>, string> = {
  approved: "laser-fill laser-approved",
  amber: "laser-fill laser-amber",
  orange: "laser-fill laser-orange",
  violet: "laser-fill laser-violet",
  fuchsia: "laser-fill laser-fuchsia",
  stopped: "laser-fill laser-stopped",
  mute: "laser-fill laser-mute",
};

export function LaserBar({ segments }: { segments: LaserSegment[] }) {
  return (
    <div className="laser-track" aria-hidden="true">
      {segments.map((segment, index) =>
        segment.width <= 0 ? null : (
          <div
            key={`${segment.tone ?? segment.color}-${index}`}
            className={segment.color ? "laser-fill" : toneClass[segment.tone ?? "mute"]}
            style={{
              width: `${Math.min(100, Math.max(0, segment.width))}%`,
              ...(segment.color
                ? {
                    background: `linear-gradient(90deg, ${hexToRgba(segment.color, 0.4)}, ${segment.color})`,
                    boxShadow: `0 0 10px ${segment.color}`,
                  }
                : {}),
            }}
          />
        ),
      )}
    </div>
  );
}
