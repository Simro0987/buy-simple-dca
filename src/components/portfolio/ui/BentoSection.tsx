import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BentoSectionProps {
  title: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  delay?: number;
}

export function BentoSection({ title, icon, className, children, delay = 0 }: BentoSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={cn('space-y-3', className)}
    >
      <div className="flex items-center gap-3 py-0.5">
        <div className="h-px flex-1 bg-white/[0.05]" />
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
          {icon}
          <span className="text-[8.5px] font-extrabold text-white/25 uppercase tracking-[0.14em]">
            {title}
          </span>
        </div>
        <div className="h-px flex-1 bg-white/[0.05]" />
      </div>
      {children}
    </motion.section>
  );
}
