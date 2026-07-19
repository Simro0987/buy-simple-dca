interface PriceSkeletonProps {
  className?: string;
}

export function PriceSkeleton({ className = "h-5 w-20" }: PriceSkeletonProps) {
  return (
    <span
      className={`inline-block animate-pulse rounded-md bg-zinc-800/90 ${className}`}
      aria-hidden="true"
    />
  );
}
