import { useState } from 'react';
import { Sliders } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';

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
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Čo ak…' : 'What if…'}
            {selected && <span className="ml-1.5 text-[10px] text-muted-foreground">· {selected}</span>}
          </span>
        </div>
        <span className={`text-sm font-bold tabular-nums ${positive ? 'text-gain' : 'text-loss'}`}>
          {pct >= 0 ? '+' : ''}{pct}%
        </span>
      </div>

      <input
        type="range"
        min={-50}
        max={200}
        step={5}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        className="w-full accent-primary"
      />

      <div className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => setPct(p)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
              pct === p
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {p > 0 ? '+' : ''}{p}%
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Teraz' : 'Now'}</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{formatUsd(baseValue)}</p>
        </div>
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Scenár' : 'Scenario'}</p>
          <p className={`text-sm font-bold tabular-nums ${positive ? 'text-gain' : 'text-loss'}`}>
            {formatUsd(projected)}
          </p>
          <p className={`text-[10px] tabular-nums ${positive ? 'text-gain' : 'text-loss'}`}>
            {positive ? '+' : ''}{formatUsd(delta)}
          </p>
        </div>
      </div>
    </div>
  );
}
