interface FearGreedGaugeProps {
  value: number;
  label: string;
  title: string;
}

export function FearGreedGauge({ value, label, title }: FearGreedGaugeProps) {
  const getColor = (v: number) => {
    if (v <= 25) return 'hsl(var(--loss))';
    if (v <= 45) return 'hsl(var(--warning))';
    if (v <= 55) return 'hsl(var(--muted-foreground))';
    if (v <= 75) return 'hsl(var(--gain))';
    return 'hsl(var(--primary))';
  };

  return (
    <div className="glass-card p-4">
      <p className="text-xs text-muted-foreground mb-3">{title}</p>
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={getColor(value)}
              strokeWidth="3"
              strokeDasharray={`${value} ${100 - value}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
            {value}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
    </div>
  );
}
