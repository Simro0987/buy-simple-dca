import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type PriceFlashDirection = 'up' | 'down' | null;

/**
 * Bloomberg-style brief color flash when a numeric price changes.
 */
export function usePriceFlash(price: number | undefined | null): {
  flash: PriceFlashDirection;
  className: string;
} {
  const [flash, setFlash] = useState<PriceFlashDirection>(null);
  const prevRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (price == null || !Number.isFinite(price) || price <= 0) return;

    const prev = prevRef.current;
    if (prev !== undefined && prev !== price) {
      setFlash(price > prev ? 'up' : 'down');
      const timer = window.setTimeout(() => setFlash(null), 500);
      prevRef.current = price;
      return () => window.clearTimeout(timer);
    }

    prevRef.current = price;
  }, [price]);

  const className = cn(
    'transition-colors duration-500',
    flash === 'up' && '!text-[#14F195]',
    flash === 'down' && '!text-red-400',
  );

  return { flash, className };
}
