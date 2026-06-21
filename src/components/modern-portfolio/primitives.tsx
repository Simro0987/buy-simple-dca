import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export const cardMotion = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

export function Bento({
  className,
  children,
  glow,
  delay = 0,
  ...props
}: HTMLMotionProps<'div'> & { glow?: 'purple' | 'orange' | 'red' | 'none'; delay?: number }) {
  const glowCls = {
    none: '',
    purple: 'shadow-[0_0_60px_-12px_rgba(153,69,255,0.35)]',
    orange: 'shadow-[0_0_40px_-8px_rgba(249,115,22,0.4)]',
    red: 'shadow-[0_0_50px_-6px_rgba(239,68,68,0.5)] animate-pulse',
  }[glow ?? 'none'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden',
        glowCls,
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] uppercase tracking-[0.14em] text-white/35 font-medium', className)}>
      {children}
    </p>
  );
}

export function Money({
  children,
  size = 'lg',
  className,
  positive,
  negative,
}: {
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const sizes = {
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
    hero: 'text-6xl md:text-7xl',
  };
  return (
    <span
      className={cn(
        'font-mono font-bold tabular-nums tracking-tight text-white leading-none',
        sizes[size],
        positive && '!text-[#14F195]',
        negative && '!text-[#ef4444]',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  children,
  color = 'default',
}: {
  children: React.ReactNode;
  color?: 'green' | 'amber' | 'red' | 'purple' | 'default';
}) {
  const styles = {
    green: 'bg-[#14F195]/10 text-[#14F195] border-[#14F195]/25',
    amber: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
    red: 'bg-red-500/10 text-red-400 border-red-500/25',
    purple: 'bg-[#9945FF]/10 text-[#9945FF] border-[#9945FF]/25',
    default: 'bg-white/5 text-white/50 border-white/10',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border', styles[color])}>
      {children}
    </span>
  );
}
