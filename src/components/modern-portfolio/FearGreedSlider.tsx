import { Label } from '@/components/modern-portfolio/primitives';

interface Props {
  value: number;
  label: string;
  loading?: boolean;
}

function barColor(value: number): string {
  if (value <= 25) return '#ef4444';
  if (value <= 45) return '#f97316';
  if (value <= 55) return 'rgba(255,255,255,0.45)';
  if (value <= 75) return '#14F195';
  return '#9945FF';
}

export function FearGreedSlider({ value, label, loading }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = barColor(clamped);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="h-3 rounded-full bg-white/[0.06]" />
        <div className="h-4 w-20 rounded bg-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-end justify-between gap-3">
        <Label>Fear & Greed</Label>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-white leading-none">{clamped}</p>
          <p className="text-xs font-medium mt-1" style={{ color }}>{label}</p>
        </div>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, #ef4444 0%, #f97316 25%, rgba(255,255,255,0.35) 50%, #14F195 75%, #9945FF 100%)`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#0A0A0A] shadow transition-all duration-700"
          style={{ left: `calc(${clamped}% - 6px)`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/30 font-mono">
        <span>0 · Fear</span>
        <span>50 · Neutral</span>
        <span>100 · Greed</span>
      </div>
    </div>
  );
}
