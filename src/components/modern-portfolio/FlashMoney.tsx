import { cn } from '@/lib/utils';
import { usePriceFlash } from '@/hooks/usePriceFlash';
import { Money } from '@/components/modern-portfolio/primitives';
import type { ComponentProps } from 'react';

type MoneyProps = ComponentProps<typeof Money>;

interface FlashMoneyProps extends MoneyProps {
  price: number | undefined | null;
}

/** Money display with Bloomberg-style green/red flash on price change. */
export function FlashMoney({ price, className, ...props }: FlashMoneyProps) {
  const { className: flashClass } = usePriceFlash(price);
  return <Money {...props} className={cn(flashClass, className)} />;
}
