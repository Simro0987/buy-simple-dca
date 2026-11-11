import { useState } from 'react';
import { Sliders } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';
import { MoneyLabel, MoneyValue } from '@/components/portfolio/ui/MoneyValue';

interface Props { lang: Lang; }

const PRESETS = [-30, -15, 0, 15, 30, 50, 100];

export function WhatIfSimulator({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics, selected } = usePortfolio();
  const [pct, setPct] = useState(20);

  const baseValue = selected
    ? (metrics.assets.find(a => a.symbol === selected)?.value ?? 0)
    : metrics.totalValue;

  if (baseValue <= 0) return null;

  const projected = baseValue * (1 + pct / 100);
  const delta = projected - baseValue;
  const positive = delta >= 0;

  return (
    <BentoCard padding="md" className="space-y-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-neon-purple" />
          <span className="text-sm font-semibold text-white">
            {sk ? 'Čo ak…' : 'What if…'}
            {selected && <span className="ml-1.5 text-[10px] text-white/35">· {selected}</span>}
          </span>
        </div>
        <MoneyValue size="sm" positive={positive} negative={!positive}>
          {pct >= 0 ? '+' : ''}{pct}%
        </MoneyValue>
      </div>

      <input
        type="range"
        min={-50}
        max={200}
        step={5}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        className="w-full accent-neon-green"
      />

      <div className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => setPct(p)}
            className={`text-[10px] px-2.5 py-0.5 rounded-full border transition ${
              pct === p
                ? 'border-neon-green bg-neon-green/15 text-neon-green'
                : 'border-white/10 text-white/40 hover:text-white/70'
            }`}
          >
            {p >= 0 ? '+' : ''}{p}%
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-1">
        <MoneyLabel>{sk ? 'Projekcia hodnoty' : 'Projected value'}</MoneyLabel>
        <MoneyValue size="lg">{formatUsd(projected)}</MoneyValue>
        <p className={`text-xs font-mono tabular-nums ${positive ? 'text-gain' : 'text-loss'}`}>
          {positive ? '+' : ''}{formatUsd(delta)} {sk ? 'od aktuálnej' : 'from current'}
        </p>
      </div>
    </BentoCard>
  );
}
