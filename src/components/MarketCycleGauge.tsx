import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Activity } from 'lucide-react';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { Lang } from '@/lib/i18n';

interface Props {
  result: MarketCycleResult;
  lang: Lang;
  /** Optional live Fear & Greed value (alternative.me) — overrides gauge score. */
  fearGreedValue?: number;
}

function zoneColor(zone: MarketCycleResult['zone']): string {
  switch (zone) {
    case 'extreme_fear': return '#ef4444';
    case 'bearish': return '#f59e0b';
    case 'neutral': return '#a3a3a3';
    case 'bullish': return '#22c55e';
    case 'euphoria': return '#f97316';
  }
}

function zoneFromFG(v: number): MarketCycleResult['zone'] {
  if (v <= 24) return 'extreme_fear';
  if (v <= 44) return 'bearish';
  if (v <= 55) return 'neutral';
  if (v <= 74) return 'bullish';
  return 'euphoria';
}

function zoneLabelSk(zone: MarketCycleResult['zone']): string {
  switch (zone) {
    case 'extreme_fear': return 'Extrémny strach';
    case 'bearish': return 'Medvedí trh';
    case 'neutral': return 'Neutrálny trh';
    case 'bullish': return 'Býčí trh';
    case 'euphoria': return 'Eufória';
  }
}
function zoneLabelEn(zone: MarketCycleResult['zone']): string {
  switch (zone) {
    case 'extreme_fear': return 'Extreme Fear';
    case 'bearish': return 'Bearish';
    case 'neutral': return 'Neutral';
    case 'bullish': return 'Bullish';
    case 'euphoria': return 'Euphoria';
  }
}

function needleRotation(score: number): number {
  // Map 0-100 to -90° (left) to +90° (right)
  return -90 + (score / 100) * 180;
}

export function MarketCycleGauge({ result, lang, fearGreedValue }: Props) {
  const sk = lang === 'sk';
  const [expanded, setExpanded] = useState(false);
  const useFg = typeof fearGreedValue === 'number' && Number.isFinite(fearGreedValue);
  const displayScore = useFg ? Math.max(0, Math.min(100, Math.round(fearGreedValue!))) : result.score;
  const displayZone = useFg ? zoneFromFG(displayScore) : result.zone;
  const displayLabel = useFg
    ? `${displayScore}/100 - ${sk ? zoneLabelSk(displayZone) : zoneLabelEn(displayZone)}`
    : result.label;
  const color = zoneColor(displayZone);
  const rotation = needleRotation(displayScore);


  return (
    <div className="glass-card p-4 space-y-3">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">
          {sk ? 'Market Cycle Score' : 'Market Cycle Score'}
        </span>
      </div>

      {/* Gauge */}
      <div className="flex flex-col items-center">
        <div className="relative w-48 h-28 overflow-hidden">
          <svg viewBox="0 0 200 110" className="w-full h-full">
            {/* Background arc segments */}
            {/* Extreme fear: 0-20 (red) */}
            <path d="M 20 100 A 80 80 0 0 1 35.7 41.3" fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
            {/* Bearish: 20-40 (yellow) */}
            <path d="M 35.7 41.3 A 80 80 0 0 1 69.1 23.4" fill="none" stroke="#f59e0b" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
            {/* Neutral: 40-60 (gray) */}
            <path d="M 69.1 23.4 A 80 80 0 0 1 130.9 23.4" fill="none" stroke="#a3a3a3" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
            {/* Bullish: 60-80 (green) */}
            <path d="M 130.9 23.4 A 80 80 0 0 1 164.3 41.3" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
            {/* Euphoria: 80-100 (orange) */}
            <path d="M 164.3 41.3 A 80 80 0 0 1 180 100" fill="none" stroke="#f97316" strokeWidth="12" strokeLinecap="round" opacity="0.3" />

            {/* Active arc up to score */}
            <path
              d="M 20 100 A 80 80 0 0 1 35.7 41.3"
              fill="none"
              stroke="#ef4444"
              strokeWidth="12"
              strokeLinecap="round"
              opacity={displayScore >= 0 ? '0.9' : '0.2'}
              strokeDasharray={displayScore <= 20 ? `${(displayScore / 20) * 55} 200` : '55 200'}
            />

            {/* Needle */}
            <g transform={`rotate(${rotation} 100 100)`}>
              <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="100" cy="100" r="5" fill={color} />
              <circle cx="100" cy="100" r="3" fill="hsl(var(--background))" />
            </g>

            {/* Labels */}
            <text x="15" y="108" fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="start">0</text>
            <text x="100" y="16" fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle">50</text>
            <text x="185" y="108" fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="end">100</text>
          </svg>
        </div>

        {/* Score display */}
        <div className="text-center -mt-2">
          <span className="text-3xl font-bold" style={{ color }}>{displayScore}</span>
          <span className="text-sm text-muted-foreground ml-1">/ 100</span>
        </div>
        <span className="text-sm font-semibold mt-1" style={{ color }}>{displayLabel}</span>
      </div>

      {/* Interpretation */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        {result.interpretation}
      </p>

      {/* Guidance */}
      <div className="bg-secondary/40 rounded-lg px-3 py-2 text-center">
        <p className="text-xs font-medium text-foreground">{result.guidance}</p>
      </div>

      {/* Token ATH context */}
      <div className="grid grid-cols-4 gap-2">
        {result.tokenContext.map(tc => (
          <div key={tc.symbol} className="text-center space-y-0.5">
            <span className="text-[10px] font-semibold" style={{ color: tc.color }}>{tc.symbol}</span>
            <p className="text-[10px] text-muted-foreground">{tc.athDistance.toFixed(0)}%</p>
            <p className={`text-[9px] ${tc.strength24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {tc.strength24h >= 0 ? '▲' : '▼'} {Math.abs(tc.strength24h).toFixed(1)}%
            </p>
          </div>
        ))}
      </div>

      {/* Expandable indicators breakdown */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full justify-center">
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {sk ? 'Detail indikátorov' : 'Indicator details'}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-1.5">
          {result.indicators.map((ind, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{ind.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">{ind.value}{typeof ind.value === 'number' && ind.name.includes('%') ? '%' : ''}</span>
                <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${ind.score}%`,
                      backgroundColor: ind.score <= 30 ? '#ef4444' : ind.score <= 60 ? '#f59e0b' : '#22c55e',
                    }}
                  />
                </div>
                <span className="text-muted-foreground w-5 text-right">{Math.round(ind.weight * 100)}%</span>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
