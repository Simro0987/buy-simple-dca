import { Shield, Info } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { RiskAssessment, RiskLevel, RiskFactor } from '@/lib/stakeRoutingService';
import { Lang } from '@/lib/i18n';

interface Props {
  risk: RiskAssessment;
  lang: Lang;
  compact?: boolean;
}

const LEVEL_CLASSES: Record<RiskLevel, { wrap: string; emoji: string; label: { sk: string; en: string } }> = {
  low: {
    wrap: 'bg-gain/15 text-gain border-gain/40',
    emoji: '🟢',
    label: { sk: 'Nízke riziko', en: 'Low Risk' },
  },
  medium: {
    wrap: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    emoji: '🟡',
    label: { sk: 'Stredné riziko', en: 'Medium Risk' },
  },
  high: {
    wrap: 'bg-loss/15 text-loss border-loss/40',
    emoji: '🔴',
    label: { sk: 'Vysoké riziko', en: 'High Risk' },
  },
};

const FACTOR_CLASSES: Record<RiskFactor, string> = {
  Low:    'text-gain',
  Medium: 'text-amber-400',
  High:   'text-loss',
  'N/A':  'text-muted-foreground',
};

export function RiskShield({ risk, lang, compact }: Props) {
  const isSk = lang === 'sk';
  const cfg = LEVEL_CLASSES[risk.level];
  const label = isSk ? cfg.label.sk : cfg.label.en;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cfg.wrap}`}
        title={`${label} (${risk.score}/10)`}
      >
        <Shield className="w-3 h-3" />
        {cfg.emoji} {compact ? `${risk.score}/10` : `${label} (${risk.score}/10)`}
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded border border-border/60 bg-secondary/40 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label={isSk ? 'Zobraziť rizikové vektory' : 'View risk vectors'}
          >
            <Info className="w-3 h-3" />
            {isSk ? 'Vektory' : 'Vectors'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-bold text-foreground">
              {isSk ? 'Rozklad rizika' : 'Risk Vectors Breakdown'}
            </p>
            <span className={`text-[10px] font-bold ${cfg.wrap} px-1.5 py-0.5 rounded border`}>
              {risk.score}/10
            </span>
          </div>
          <ul className="space-y-1.5">
            <li className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground">
                  {isSk ? 'Smart contract' : 'Smart Contract'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {isSk ? 'Audit + TVL trvanie' : 'Audit flags + TVL duration'}
                </p>
              </div>
              <span className={`text-[11px] font-semibold ${FACTOR_CLASSES[risk.vectors.smartContract]}`}>
                {risk.vectors.smartContract}
              </span>
            </li>
            <li className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground">
                  {isSk ? 'Likvidácia / Depeg' : 'Liquidation / Depeg'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {isSk ? 'stETH, JitoSOL, weETH odchýlka' : 'stETH, JitoSOL, weETH deviation'}
                </p>
              </div>
              <span className={`text-[11px] font-semibold ${FACTOR_CLASSES[risk.vectors.depeg]}`}>
                {risk.vectors.depeg}
              </span>
            </li>
            <li className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground">
                  {isSk ? 'Unbonding lockup' : 'Unbonding Lockup'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {isSk ? 'Zmrazené počas pádu trhu' : 'Frozen during market crash'}
                </p>
              </div>
              <span className={`text-[11px] font-semibold ${FACTOR_CLASSES[risk.vectors.lockup]}`}>
                {risk.vectors.lockup}
              </span>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
