import { useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Hexagon } from 'lucide-react';

type Token = 'BTC' | 'ETH' | 'SOL';

interface AxisPoint {
  axis: string;
  value: number;
}

interface TokenData {
  color: string;
  axes: AxisPoint[];
}

const MOCK: Record<Token, TokenData> = {
  BTC: {
    color: '#F7931A',
    axes: [
      { axis: 'RSI',          value: 45 },
      { axis: 'MFI',          value: 40 },
      { axis: 'Bollinger',    value: 55 },
      { axis: 'Fear & Greed', value: 38 },
      { axis: '200WMA',       value: 42 },
      { axis: 'On-chain',     value: 50 },
    ],
  },
  ETH: {
    color: '#627EEA',
    axes: [
      { axis: 'RSI',          value: 60 },
      { axis: 'MFI',          value: 55 },
      { axis: 'Bollinger',    value: 65 },
      { axis: 'Fear & Greed', value: 52 },
      { axis: '200WMA',       value: 58 },
      { axis: 'On-chain',     value: 62 },
    ],
  },
  SOL: {
    color: '#9945FF',
    axes: [
      { axis: 'RSI',          value: 72 },
      { axis: 'MFI',          value: 68 },
      { axis: 'Bollinger',    value: 70 },
      { axis: 'Fear & Greed', value: 65 },
      { axis: '200WMA',       value: 74 },
      { axis: 'On-chain',     value: 71 },
    ],
  },
};

function radarFill(avg: number): string {
  if (avg < 40) return '#10b981';
  if (avg > 70) return '#ef4444';
  return '#3b82f6';
}

const TOKENS: Token[] = ['BTC', 'ETH', 'SOL'];

export function ConfluenceHexagon() {
  const [active, setActive] = useState<Token>('BTC');
  const data = MOCK[active];
  const avg = data.axes.reduce((s, d) => s + d.value, 0) / data.axes.length;
  const fill = radarFill(avg);
  const zoneLabel = avg < 40 ? 'Akumulácia' : avg > 70 ? 'Eufória' : 'Neutrálna zóna';
  const zoneCls   = avg < 40 ? 'text-emerald-400' : avg > 70 ? 'text-rose-400' : 'text-blue-400';

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Hexagon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex-1">
          Confluence Hexagon
        </p>
        <span className={`text-[10px] font-bold tabular-nums ${zoneCls}`}>
          {zoneLabel} · {avg.toFixed(0)}/100
        </span>
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
            style={active === t ? { backgroundColor: MOCK[t].color } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Radar chart */}
      <ResponsiveContainer width="100%" height={230}>
        <RadarChart data={data.axes} margin={{ top: 12, right: 24, bottom: 8, left: 24 }}>
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
      <p className="text-[9px] text-muted-foreground/60 text-center mt-1">mock dáta · live API v ďalšej verzii</p>
    </div>
  );
}
