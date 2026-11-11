import { ResponsiveContainer, LineChart, Line } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color, height = 40 }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const isUp = data[data.length - 1] >= data[0];
  const lineColor = color || (isUp ? '#22c55e' : '#ef4444');

  const chartData = data.map((value, i) => ({ i, v: value }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
