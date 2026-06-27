import { Bento } from '@/components/modern-portfolio/primitives';

export function PortfolioHeroSkeleton() {
  return (
    <div className="pt-2 pb-1 animate-pulse space-y-4">
      <div className="h-3 w-40 rounded bg-white/10" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="h-12 sm:h-16 w-56 rounded-xl bg-white/[0.06]" />
        <div className="space-y-2">
          <div className="h-6 w-28 rounded bg-white/[0.06] ml-auto" />
          <div className="h-4 w-16 rounded bg-white/[0.04] ml-auto" />
        </div>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-7 w-20 rounded-full bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

export function PortfolioStatSkeleton() {
  return (
    <Bento className="p-3 sm:p-4 min-w-0">
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-16 rounded bg-white/10" />
        <div className="h-7 w-24 rounded bg-white/[0.06]" />
      </div>
    </Bento>
  );
}

export function PortfolioPositionSkeleton() {
  return (
    <Bento className="p-4 sm:p-5 min-w-0">
      <div className="animate-pulse flex gap-3">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.06] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-32 rounded bg-white/[0.06]" />
          <div className="h-3 w-48 rounded bg-white/[0.04]" />
        </div>
      </div>
    </Bento>
  );
}
