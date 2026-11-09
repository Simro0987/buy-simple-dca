import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDefiActions } from '@/stores/defiActionStore';
import { type StakeKind } from '@/stores/activeStakingStore';
import { usePortfolioAssets } from '@/hooks/usePortfolioAssets';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { useAuditLog } from '@/stores/auditLogStore';

/**
 * Advisory action button — records the manual execution into the global DeFi
 * action store, turns green, locks itself and fires a success toast.
 *
 * Portfolio state transfers (never a sale):
 *  - `stakeProtocol`   → Liquid → Staked (or Collateral when `stakeKind="collateral"`)
 *  - `unstakeProtocol` → Staked/Collateral → Liquid
 *  - `debtAsset` + `debtUsd` → Borrow +  (or Borrow − when `repay`)
 */
export function RecordActionButton({
  actionId,
  symbol,
  amount,
  label,
  doneLabel,
  toastMessage,
  disabled,
  stakeProtocol,
  stakeKind = 'staked',
  stakeApy,
  unstakeProtocol,
  debtAsset,
  debtUsd,
  repay,
  fullyAllocated,
  performAction,
  auditNetwork,
}: {
  actionId: string;
  symbol: string;
  amount: number;
  label: string;
  doneLabel: string;
  toastMessage: string;
  disabled?: boolean;
  stakeProtocol?: string;
  stakeKind?: StakeKind;
  stakeApy?: number;
  unstakeProtocol?: string;
  debtAsset?: string;
  debtUsd?: number;
  repay?: boolean;
  /** Vrstva je už plne alokovaná — tlačidlo sa zamkne a zobrazí „Plne alokované“. */
  fullyAllocated?: boolean;
  /** Custom layer operation; returns false if no real state change was recorded. */
  performAction?: () => boolean;
  /** Sieť pre audit log (protokol sa berie zo stake/unstake protokolu). */
  auditNetwork?: string;
}) {
  const { store, execute } = useDefiActions();
  const qc = useQueryClient();
  const { byToken } = usePortfolioAssets();
  const [busy, setBusy] = useState(false);
  const done = !!store[actionId];

  /** Dostupný Liquid zostatok (ak aktívum poznáme) — stakovať sa dá len z neho. */
  const liquid = byToken?.[symbol.toUpperCase() as keyof typeof byToken]?.liquidQty;

  const onClick = () => {
    if (done || busy || disabled || fullyAllocated || !Number.isFinite(amount) || amount <= 0) return;

    // STRIKTNÁ KONTROLA: nikdy nestakuj viac, než je v Liquid zostatku.
    if (stakeProtocol && typeof liquid === 'number') {
      if (liquid <= 1e-9) {
        toast.error(`Žiadny dostupný Liquid zostatok ${symbol.toUpperCase()} na stakovanie.`);
        return;
      }
      if (amount > liquid + 1e-9) {
        toast.error(
          `Nedostatočný Liquid zostatok: dostupné ${liquid.toFixed(4)} ${symbol.toUpperCase()}.`,
        );
        return;
      }
    }

    setBusy(true);
    const recorded = performAction
      ? performAction() && useDefiActions.getState().record(actionId, symbol, amount)
      : execute({ id: actionId, symbol, amount, stakeProtocol, stakeKind, stakeApy, unstakeProtocol, debtAsset, debtUsd, repay });
    if (!recorded) { setBusy(false); return; }
    const proto = stakeProtocol ?? unstakeProtocol ?? debtAsset ?? '—';
    const net = auditNetwork ?? (proto.match(/·\s*([^(]+?)\s*(\(|$)/)?.[1] ?? '—');
    useAuditLog.getState().add({ action: label, protocol: proto.split('·')[0].trim(), network: net, amount: debtUsd ?? amount, symbol: debtUsd != null ? (debtAsset ?? 'USD') : symbol.toUpperCase() });
    void qc.invalidateQueries({ queryKey: ['globalBalances'] });
    toast.success(toastMessage);
    setTimeout(() => setBusy(false), 600);
  };

  const full = !!fullyAllocated && !done;

  return (
    <Button variant="ghost"
      type="button"
      onClick={onClick}
      disabled={done || busy || disabled || full}
      className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ease-in-out flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
        done || full
          ? 'bg-gain/20 text-gain border border-gain/40 hover:bg-gain/20 hover:text-gain disabled:opacity-100'
          : 'bg-accent hover:bg-accent/90 text-accent-foreground disabled:opacity-40'
      }`}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {(done || full) && <Check className="w-3.5 h-3.5" />}
      {done ? '✓ Zaznamenané' : full ? 'Plne alokované / Hotovo' : label}
    </Button>
  );
}
