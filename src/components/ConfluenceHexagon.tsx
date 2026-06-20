import { useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Hexagon, RefreshCw, AlertCircle } from 'lucide-react';
import { useConfluenceMetrics, HexToken } from '@/hooks/useConfluenceMetrics';

const TOKENS: HexToken[] = ['BTC', 'ETH', 'SOL'];

function radarFill(avg: number): string {
  if (avg < 40) return '#10b981';
  if (avg > 70) return '#ef4444';
  return '#3b82f6';
}

function zoneLabel(avg: number) {
  if (avg < 40) return { label: 'Akumulácia', cls: 'text-emerald-400' };
  if (avg > 70) return { label: 'Eufória',    cls: 'text-rose-400' };
  return           { label: 'Neutrálna zóna', cls: 'text-blue-400' };
}

export function ConfluenceHexagon() {
  const [active, setActive] = useState<HexToken>('BTC');
  const { metrics, isLoading, hasError, refetch } = useConfluenceMetrics();

  const tokenData = metrics?.[active];
  const avg = tokenData
    ? tokenData.axes.reduce((s, d) => s + d.value, 0) / tokenData.axes.length
    : 0;
  const fill = radarFill(avg);
  const zone = zoneLabel(avg);

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Hexagon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex-1">
          Confluence Hexagon
        </p>
        {!isLoading && tokenData && (
          <span className={`text-[10px] font-bold tabular-nums ${zone.cls}`}>
            {zone.label} · {avg.toFixed(0)}/100
          </span>
        )}
        <button
          onClick={refetch}
          disabled={isLoading}
          className="p-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-40"
          title="Obnoviť dáta"
        >
          <RefreshCw className={`w-3 h-3 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Token tabs */}
      <div className="flex gap-1.5 mb-3">
        {TOKENS.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97] ${
              active === t ? 'text-background' : 'bg-secondary/40 text-muted-foreground hover:text-foreground'
            }`}
            style={active === t && metrics ? { backgroundColor: metrics[t].color } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center h-[230px] gap-3">
          <div className="w-24 h-24 rounded-full bg-secondary/40 animate-pulse" />
          <p className="text-[11px] text-muted-foreground animate-pulse">Načítavam metriky…</p>
        </div>
      )}

      {/* Error state */}
      {!isLoading && hasError && (
        <div className="flex flex-col items-center justify-center h-[230px] gap-3">
          <AlertCircle className="w-8 h-8 text-rose-400/70" />
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Nepodarilo sa načítať trhové dáta.<br />Skontroluj pripojenie a skús znovu.
          </p>
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-foreground active:scale-95"
          >
            <RefreshCw className="w-3 h-3" /> Skúsiť znovu
          </button>
        </div>
      )}

      {/* Radar chart */}
      {!isLoading && !hasError && tokenData && (
        <>
          <ResponsiveContainer width="100%" height={230}>
            <RadarChart data={tokenData.axes} margin={{ top: 12, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="rgba(255,255,255,0.07)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9.5, fontWeight: 600 }}
              />
              <Radar
                name={active}
                dataKey="value"
                stroke={fill}
                fill={fill}
                fillOpacity={0.3}
                strokeWidth={2}
                dot={{ r: 3, fill, strokeWidth: 0 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '10px',
                  fontSize: '11px',
                  color: 'hsl(var(--foreground))',
                }}
                formatter={(value: number | string) => [`${value}/100`, active]}
              />
            </RadarChart>
          </ResponsiveContainer>

          {/* Zone legend */}
          <div className="flex justify-between mt-1 px-1">
            <span className="text-[9px] text-emerald-400 font-semibold">0–40 Akumulácia</span>
            <span className="text-[9px] text-muted-foreground">40–70 Neutrál</span>
            <span className="text-[9px] text-rose-400 font-semibold">70+ Eufória</span>
          </div>
          <p className="text-[9px] text-muted-foreground/50 text-center mt-1">
            RSI & Bollinger z CoinGecko · Fear & Greed: alternative.me · MFI & On-chain: aproximácia
          </p>
        </>
      )}
    </div>
  );
}
