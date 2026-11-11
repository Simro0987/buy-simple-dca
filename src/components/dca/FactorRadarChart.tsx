import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { FactorBreakdown } from '@/lib/mondayController';

interface Props {
  factors: FactorBreakdown[];
  overrides?: Partial<Record<FactorBreakdown['key'], number>>;
}

export function FactorRadarChart({ factors, overrides }: Props) {
  const data = factors.map(f => {
    const o = overrides?.[f.key];
    return {
      factor: f.label,
      auto: f.score,
      override: typeof o === 'number' ? o : f.score,
    };
  });
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="factor" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
          <Radar name="Auto" dataKey="auto" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} />
          {overrides && Object.keys(overrides).length > 0 && (
            <Radar name="Override" dataKey="override" stroke="hsl(var(--accent-foreground))" fill="hsl(var(--accent-foreground))" fillOpacity={0.15} />
          )}
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
