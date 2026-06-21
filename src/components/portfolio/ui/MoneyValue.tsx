import { cn } from '@/lib/utils';

type MoneySize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const sizeMap: Record<MoneySize, string> = {
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
  hero: 'text-5xl md:text-6xl',
};

interface MoneyValueProps {
  children: React.ReactNode;
  size?: MoneySize;
  className?: string;
  positive?: boolean;
  negative?: boolean;
}

export function MoneyValue({ children, size = 'lg', className, positive, negative }: MoneyValueProps) {
  return (
    <span
      className={cn(
        'font-mono font-bold tabular-nums tracking-tight leading-none',
        sizeMap[size],
        positive && 'text-gain',
        negative && 'text-loss',
        !positive && !negative && 'text-white',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MoneyLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] uppercase tracking-[0.12em] text-white/40 font-semibold', className)}>
      {children}
    </p>
  );
}
