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
import { Hexagon, RefreshCw, WifiOff } from 'lucide-react';
import { useConfluenceMetrics, OctToken, DataQuality } from '@/hooks/useConfluenceMetrics';

const TOKENS: OctToken[] = ['BTC', 'ETH', 'SOL'];

function radarFill(avg: number): string {
  if (avg < 40) return '#10b981';
  if (avg > 70) return '#ef4444';
  return '#3b82f6';
}

function zoneInfo(avg: number) {
  if (avg < 40) return { label: 'Makro akumulácia', cls: 'text-emerald-400', desc: 'Výborné pre DCA' };
  if (avg > 70) return { label: 'Makro eufória',    cls: 'text-rose-400',    desc: 'Zvažuj výber ziskov' };
  return           { label: 'Neutrálna zóna',       cls: 'text-blue-400',    desc: 'Štandardné DCA' };
}

function StatusDot({ quality, liveCount }: { quality: DataQuality; liveCount: number }) {
  if (quality === 'disconnected') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30">
        <WifiOff className="w-2.5 h-2.5 text-rose-400" />
        <span className="text-[8px] font-semibold text-rose-400 uppercase tracking-wide">API Disconnected</span>
      </span>
    );
  }
  if (quality === 'partial') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-[8px] font-semibold text-amber-400 uppercase tracking-wide">
          Partial · {liveCount}/8 live
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-[8px] font-semibold text-emerald-400 uppercase tracking-wide">Live</span>
    </span>
  );
}

export function ConfluenceOctagon() {
  const [active, setActive] = useState<OctToken>('BTC');
  const { metrics, isLoading, dataQuality, liveCount, refetch } = useConfluenceMetrics();

  const tokenData = metrics[active];
  const avg  = tokenData.axes.reduce((s, d) => s + d.value, 0) / tokenData.axes.length;
  const fill = dataQuality === 'disconnected' ? '#6b7280' : radarFill(avg);
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
          {!isLoading && dataQuality !== 'disconnected' && (
            <p className={`text-[9px] font-medium mt-0.5 ${zone.cls}`}>
              {zone.label} · {zone.desc}
            </p>
          )}
        </div>
        {!isLoading && (
          <StatusDot quality={dataQuality} liveCount={liveCount} />
        )}
        {!isLoading && dataQuality !== 'disconnected' && (
          <span className={`text-sm font-bold tabular-nums ml-1 ${zone.cls}`}>
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
            style={active === t ? { backgroundColor: metrics[t].color } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Loading skeleton — only on first ever load (no metrics yet) */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center h-[240px] gap-3">
          <div className="relative">
            {/* octagon skeleton rings */}
            {[28, 20, 12].map(s => (
              <div
                key={s}
                className="absolute inset-0 rounded-full bg-secondary/30 animate-pulse"
                style={{ width: s * 4, height: s * 4, margin: 'auto', top: 0, bottom: 0, left: 0, right: 0 }}
              />
            ))}
            <div className="w-28 h-28 rounded-full" />
          </div>
          <p className="text-[11px] text-muted-foreground animate-pulse">Načítavam makro metriky…</p>
        </div>
      )}

      {/* Chart — always rendered after first load, even on error (shows fallback data) */}
      {!isLoading && (
        <>
          {/* Disconnected banner above chart */}
          {dataQuality === 'disconnected' && (
            <div className="flex items-center justify-center gap-2 py-2 mb-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[10px] font-semibold text-rose-400">
                API Disconnected — zobrazené záložné dáta
              </span>
              <button
                onClick={refetch}
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-[9px] font-medium text-rose-300 active:scale-95"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Retry
              </button>
            </div>
          )}

          <ResponsiveContainer width="100%" height={240}>
            <RadarChart
              data={tokenData.axes}
              margin={{ top: 14, right: 28, bottom: 10, left: 28 }}
              style={{ opacity: dataQuality === 'disconnected' ? 0.5 : 1 }}
            >
              <PolarGrid stroke="rgba(255,255,255,0.07)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontWeight: 600 }}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name={active}
                dataKey="value"
                stroke={fill}
                fill={fill}
                fillOpacity={dataQuality === 'disconnected' ? 0.12 : 0.28}
                strokeWidth={dataQuality === 'disconnected' ? 1 : 2}
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

          {/* Axis legend with live/approx badges */}
          <div className="grid grid-cols-4 gap-x-2 gap-y-1 mt-2 px-1">
            {tokenData.axes.map(a => (
              <div key={a.axis} className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.live ? '' : 'opacity-40'}`}
                  style={{ backgroundColor: fill }}
                />
                <span className={`text-[9px] truncate ${a.live ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                  {a.axis}
                </span>
                <span className="text-[9px] font-bold tabular-nums ml-auto" style={{ color: a.live ? fill : '#6b7280' }}>
                  {a.value}
                </span>
              </div>
            ))}
          </div>

          {/* Zone strip */}
          <div className="flex justify-between mt-2.5 px-1">
            <span className="text-[9px] text-emerald-400 font-semibold">0–40 Akumulácia · DCA max</span>
            <span className="text-[9px] text-rose-400 font-semibold">70+ Eufória · Zisky</span>
          </div>

          {/* Data source footer */}
          <p className="text-[9px] text-muted-foreground/40 text-center mt-1 leading-relaxed">
            {dataQuality === 'live'
              ? 'Všetky dostupné dáta live · jasné os = live, tmavé = aproximácia'
              : dataQuality === 'partial'
              ? 'Čiastočné live dáta · jasné = live, tmavé = aproximácia'
              : 'Záložné dáta · API nedostupné'}
          </p>
        </>
      )}
    </div>
  );
}
