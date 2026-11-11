import { CopyButton } from '@/components/CopyButton';
import { fmtQty } from '@/lib/formatNumber';

/** Formats a raw token amount for copy buttons — number only, no symbol. */
export function rawAmount(amount: number, _decimals = 4): string {
  return fmtQty(amount);
}

function fmtUsd(usd: number): string {
  return `$${usd.toLocaleString('sk-SK', { maximumFractionDigits: 2 })}`;
}

/**
 * PRIMARY = exact token amount, SECONDARY = live USD equivalent in gray.
 * Never flips the hierarchy — USD is always the supporting value.
 */
export function TokenValue({
  amount,
  symbol,
  price,
  decimals = 4,
  size = 'lg',
  copy = false,
  copyLabel = 'Kopírovať',
}: {
  amount: number;
  symbol: string;
  price?: number;
  decimals?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  copy?: boolean;
  copyLabel?: string;
}) {
  const primaryCls =
    size === 'xl' ? 'text-3xl' : size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-base';
  const amountText = rawAmount(amount, decimals);
  const fittedCls = amountText.length > 15 ? (size === 'xl' || size === 'lg' ? 'text-lg' : 'text-xs') : primaryCls;
  const usd = price && price > 0 ? amount * price : null;

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 transition-all duration-300 ease-in-out">
      <div className="min-w-0">
        <p className={`${fittedCls} font-bold font-mono text-foreground leading-tight break-words`}>
          <span className="inline-block">{amountText}</span> <span className="text-accent text-[0.6em] font-semibold">{symbol}</span>
        </p>
        <p className={`text-[11px] font-mono mt-0.5 ${usd === null ? 'text-warning' : 'text-muted-foreground'}`}>
          {usd === null ? 'Cena nedostupná / Načítavam…' : `≈ ${fmtUsd(usd)}`}
        </p>
      </div>
      {copy && <CopyButton text={rawAmount(amount, decimals)} label={copyLabel} />}
    </div>
  );
}
