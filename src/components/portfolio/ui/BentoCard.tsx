import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type BentoVariant = 'default' | 'elevated' | 'radar' | 'glow-orange' | 'glow-red';

interface BentoCardProps extends HTMLMotionProps<'div'> {
  variant?: BentoVariant;
  accentColor?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantClasses: Record<BentoVariant, string> = {
  default: '',
  elevated: 'shadow-[0_0_40px_-14px_rgba(153,69,255,0.25)]',
  radar: 'shadow-[0_0_60px_-10px_rgba(168,85,247,0.35)] border-white/[0.12]',
  'glow-orange': 'shadow-[0_0_24px_-6px_rgba(249,115,22,0.40)] border-orange-500/30',
  'glow-red': 'shadow-[0_0_28px_-6px_rgba(239,68,68,0.45)] border-red-500/40 animate-pulse',
};

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function BentoCard({
  className,
  variant = 'default',
  accentColor,
  padding = 'md',
  children,
  ...props
}: BentoCardProps) {
  return (
    <motion.div
      className={cn(
        'bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden',
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      style={accentColor ? { borderLeftWidth: 2, borderLeftColor: accentColor } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function BentoGrid({ className, children, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function BentoStat({
  label,
  value,
  subValue,
  valueClassName,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3">
      <p className="text-[9px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">{label}</p>
      <p className={cn('font-mono font-bold text-white tabular-nums leading-none', valueClassName ?? 'text-sm')}>
        {value}
      </p>
      {subValue && (
        <p className="font-mono text-[10px] text-white/50 tabular-nums mt-1">{subValue}</p>
      )}
    </div>
  );
}
