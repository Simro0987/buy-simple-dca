/** Visual-only terminal tokens. No math or state. */
export const neonApproved = "#00FFA3";
export const neonStopped = "#FF2A6D";

export const tokenUnderglow: Record<string, string> = {
  BTC: "shadow-[0_0_28px_rgba(247,147,26,0.22)] before:bg-[radial-gradient(circle_at_20%_0%,rgba(247,147,26,0.18),transparent_55%)]",
  ETH: "shadow-[0_0_28px_rgba(98,126,234,0.2)] before:bg-[radial-gradient(circle_at_20%_0%,rgba(98,126,234,0.16),transparent_50%),radial-gradient(circle_at_90%_100%,rgba(34,211,238,0.12),transparent_45%)]",
  SOL: "shadow-[0_0_28px_rgba(20,241,149,0.16)] before:bg-[radial-gradient(circle_at_15%_0%,rgba(20,241,149,0.16),transparent_50%),radial-gradient(circle_at_90%_110%,rgba(153,69,255,0.14),transparent_45%)]",
};

export const terminalCard =
  "terminal-card terminal-lift relative overflow-hidden rounded-3xl border border-white/5 bg-[rgba(9,11,17,0.72)] shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-[12px] before:pointer-events-none before:absolute before:inset-0 before:content-['']";

export const terminalInset =
  "rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-[12px]";

export const stoppedBadge =
  "inline-flex items-center gap-1 border border-[#FF2A6D] bg-[rgba(255,42,109,0.14)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#FF2A6D]";

export const approvedBadge =
  "inline-flex items-center gap-1 border border-[#00FFA3]/40 bg-[rgba(0,255,163,0.08)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#00FFA3]";

export const compactChip =
  "rounded-sm border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-400";
