import { AlertTriangle } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';
import { computeConcentrationWarnings, ConcentrationWarning } from '@/lib/decisionEngine';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';

function levelClasses(l: ConcentrationWarning['level']) {
  switch (l) {
    case 'low': return 'border-neon-green/30 bg-neon-green/5 text-neon-green';
    case 'medium': return 'border-neon-gold/30 bg-neon-gold/5 text-neon-gold';
    case 'high': return 'border-red-500/30 bg-red-500/5 text-red-400';
  }
}

function levelLabel(l: ConcentrationWarning['level']) {
  return l === 'low' ? 'NÍZKE' : l === 'medium' ? 'STREDNÉ' : 'VYSOKÉ';
}

export function ConcentrationWarnings() {
  const { data: prices } = usePrices();
  const warnings = computeConcentrationWarnings(prices);
  if (warnings.length === 0) return null;

  return (
    <BentoCard padding="sm" className="space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-neon-gold" />
        <h2 className="text-xs font-bold text-white uppercase tracking-wide">
          Koncentračné riziko
        </h2>
      </div>
      <div className="space-y-1.5">
        {warnings.map((w, i) => (
          <div key={i} className={`rounded-2xl border p-2.5 ${levelClasses(w.level)}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-white">{w.title}</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/40">
                {levelLabel(w.level)}
              </span>
            </div>
            <p className="text-[11px] text-white/50 leading-snug">{w.message}</p>
            <p className="text-[11px] text-white/70 mt-1 leading-snug">→ {w.recommendation}</p>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}
