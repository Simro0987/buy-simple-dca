import type { BrakeBoostMode, BrakeBoostState } from '@/lib/safetyBrakeBoost';

const STYLE: Record<Exclude<BrakeBoostMode, 'NORMAL'>, { dot: string; text: string; chip: string }> = {
  STOP:       { dot: '🔴', text: 'STOP (0%)',        chip: 'bg-rose-500/15 text-rose-300 ring-rose-500/40' },
  REDUCE:     { dot: '🟡', text: 'REDUCE (50%)',     chip: 'bg-amber-500/15 text-amber-300 ring-amber-500/40' },
  BOOST:      { dot: '🔵', text: 'BOOST (150%)',     chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/40' },
  DEEP_BOOST: { dot: '🟣', text: 'DEEP BOOST (200%)', chip: 'bg-purple-500/15 text-purple-300 ring-purple-500/40' },
};

/**
 * Safety Active Brake & Boost badge — vykreslí sa IBA v MKT bloku,
 * pretože multiplier ovplyvňuje výhradne Market alokáciu (LMT zostáva nedotknutý).
 * NORMAL (100 %) nevykresľuje nič.
 */
export function BrakeBoostBadge({ state, className = '' }: { state?: BrakeBoostState | null; className?: string }) {
  if (!state || !state.evaluated || state.mode === 'NORMAL') return null;
  const s = STYLE[state.mode];
  return (
    <span
      title={state.reason}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ring-1 ${s.chip} ${className}`}
    >
      <span aria-hidden>{s.dot}</span> {s.text}
    </span>
  );
}
