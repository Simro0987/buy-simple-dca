"use client";

interface LaserSegment {
  width: number;
  tone: "approved" | "amber" | "orange" | "violet" | "fuchsia" | "stopped" | "mute";
}

const toneClass: Record<LaserSegment["tone"], string> = {
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
            key={`${segment.tone}-${index}`}
            className={toneClass[segment.tone]}
            style={{ width: `${Math.min(100, Math.max(0, segment.width))}%` }}
          />
        ),
      )}
    </div>
  );
}
