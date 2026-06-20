import { useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Hexagon, RefreshCw, AlertCircle } from 'lucide-react';
import { useConfluenceMetrics, OctToken } from '@/hooks/useConfluenceMetrics';

const TOKENS: OctToken[] = ['BTC', 'ETH', 'SOL'];

function radarFill(avg: number): string {
  if (avg < 40) return '#10b981';
  if (avg > 70) return '#ef4444';
  return '#3b82f6';
}

function zoneInfo(avg: number) {
  if (avg < 40) return { label: 'Makro akumulácia',   cls: 'text-emerald-400', desc: 'Výborné pre DCA' };
  if (avg > 70) return { label: 'Makro eufória',       cls: 'text-rose-400',    desc: 'Zvažuj výber ziskov' };
  return           { label: 'Neutrálna zóna',          cls: 'text-blue-400',    desc: 'Štandardné DCA' };
}

export function ConfluenceOctagon() {
  const [active, setActive] = useState<OctToken>('BTC');
  const { metrics, isLoading, hasError, refetch } = useConfluenceMetrics();

  const tokenData = metrics?.[active];
  const avg  = tokenData ? tokenData.axes.reduce((s, d) => s + d.value, 0) / tokenData.axes.length : 0;
  const fill = radarFill(avg);
  const zone = zoneInfo(avg);

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Hexagon className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
            Confluence Octagon
          </p>
          {!isLoading && tokenData && (
            <p className={`text-[9px] font-medium mt-0.5 ${zone.cls}`}>
              {zone.label} · {zone.desc}
            </p>
          )}
        </div>
        {!isLoading && tokenData && (
          <span className={`text-sm font-bold tabular-nums ${zone.cls}`}>
            {avg.toFixed(0)}<span className="text-[9px] text-muted-foreground font-normal">/100</span>
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
      <div className="flex gap-1.5 mb-2">
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
        <div className="flex flex-col items-center justify-center h-[240px] gap-3">
          <div className="w-28 h-28 rounded-full bg-secondary/40 animate-pulse" />
          <p className="text-[11px] text-muted-foreground animate-pulse">Načítavam makro metriky…</p>
        </div>
      )}

      {/* Error state */}
      {!isLoading && hasError && (
        <div className="flex flex-col items-center justify-center h-[240px] gap-3">
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

      {/* Octagon radar chart */}
      {!isLoading && !hasError && tokenData && (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={tokenData.axes} margin={{ top: 14, right: 28, bottom: 10, left: 28 }}>
              <PolarGrid stroke="rgba(255,255,255,0.07)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontWeight: 600 }}
              />
              {/* Force 0-100 domain so octagon shape is always regular */}
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name={active}
                dataKey="value"
                stroke={fill}
                fill={fill}
                fillOpacity={0.28}
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

          {/* Axis legend */}
          <div className="grid grid-cols-4 gap-x-2 gap-y-1 mt-2 px-1">
            {tokenData.axes.map(a => (
              <div key={a.axis} className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: fill }}
                />
                <span className="text-[9px] text-muted-foreground truncate">{a.axis}</span>
                <span className="text-[9px] font-bold tabular-nums ml-auto" style={{ color: fill }}>
                  {a.value}
                </span>
              </div>
            ))}
          </div>

          {/* Zone strip */}
          <div className="flex justify-between mt-2.5 px-1">
            <span className="text-[9px] text-emerald-400 font-semibold">0–40 Akumulácia ↓ DCA max</span>
            <span className="text-[9px] text-rose-400 font-semibold">70+ Eufória ↑ Zisky</span>
          </div>
          <p className="text-[9px] text-muted-foreground/50 text-center mt-1">
            RSI·Bollinger: CoinGecko · Fear/Greed: alternative.me · MVRV: live price/realized · Funding: approx
          </p>
        </>
      )}
    </div>
  );
}
