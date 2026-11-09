/**
 * Rozbaliteľný vizuálny rozklad vnorených stavov aktíva:
 * Liquid · Staked · Collateral · Borrow.  Total = (L + S + C) − B.
 * Obsahuje manuálnu korekciu stavov a simuláciu denného staking výnosu.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Wallet, Lock, Landmark, HandCoins, Pencil, Sprout } from 'lucide-react';
import type { PortfolioAsset } from '@/hooks/usePortfolioAssets';
import { LayerTransferModal } from '@/components/portfolio/LayerTransferModal';
import { useStakingAccrual, accrualFor } from '@/hooks/useStakingAccrual';
import { Button } from '@/components/ui/button';
import { fmtQty } from '@/lib/formatNumber';

const sk = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
const usd = (n: number) => `$${sk(n)}`;
const qtyFmt = (n: number) => fmtQty(n);
const yieldFmt = (n: number) => n.toFixed(8).replace('.', ',');

interface Row {
  key: string;
  label: string;
  icon: React.ReactNode;
  qty: number;
  bar: string;
  text: string;
  negative?: boolean;
  valueLabel?: string;
  detail?: string;
}

export function AssetLayerBreakdown({ a }: { a: PortfolioAsset }) {
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const accrualMap = useStakingAccrual();
  const accrual = accrualFor(accrualMap, a.assetSymbol);
  const gross = a.liquidQty + a.stakedQty + a.collateralQty;
  const hasLocked = a.stakedQty > 0 || a.collateralQty > 0 || a.borrowQty > 0;
  const p = a.tokenPrice;

  const rows: Row[] = [
    { key: 'liquid', label: 'Liquid (Voľné)', icon: <Wallet className="w-3 h-3" />, qty: a.liquidQty, bar: 'bg-gain', text: 'text-gain' },
    { key: 'staked', label: 'Staked (Delegované)', icon: <Lock className="w-3 h-3" />, qty: a.stakedQty, bar: 'bg-accent', text: 'text-accent', detail: accrual?.apy ? `${sk(accrual.apy, 2)} % APY` : undefined },
    { key: 'collateral', label: 'Collateral (Zábezpeka)', icon: <Landmark className="w-3 h-3" />, qty: a.collateralQty, bar: 'bg-sky-400', text: 'text-sky-300' },
    { key: 'borrow', label: 'Borrow (Dlh / Margin)', icon: <HandCoins className="w-3 h-3" />, qty: a.borrowQty, bar: 'bg-loss', text: 'text-loss', negative: true, valueLabel: `${usd(a.borrowUsd)} USDC` },
  ];

  const pct = (q: number) => (gross > 0 ? Math.min(100, (q / gross) * 100) : 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setOpen(o => !o)}
          className="h-7 flex-1 justify-between gap-2 px-0 font-mono text-[10px] text-muted-foreground min-w-0 hover:bg-transparent hover:text-foreground"
          aria-expanded={open}
        >
          <span className="flex items-center gap-1">
            <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            Rozklad stavov
            {hasLocked && (
              <span className="ml-1 text-white/30">
                🔒 {qtyFmt(a.stakedQty + a.collateralQty)} {a.assetSymbol} viazané
              </span>
            )}
          </span>
          <span className="text-white/35 tabular-nums">Total {qtyFmt(a.tokenQuantity)} {a.assetSymbol}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setManage(true)}
          className="h-7 gap-1 border-border bg-secondary/40 px-2 font-mono text-[10px] text-muted-foreground"
          aria-label={`Upraviť vnútorné zostatky ${a.assetSymbol}`}
        >
          <Pencil className="w-3 h-3" />
          Upraviť
        </Button>
      </div>

      {/* Stacked bar — vždy viditeľný */}
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex">
        {rows.filter(r => !r.negative).map(r => (
          <motion.div
            key={r.key}
            className={`h-full ${r.bar}`}
            initial={false}
            animate={{ width: `${pct(r.qty)}%` }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Simulovaný staking výnos — narastá priebežne z live APY */}
      {accrual && accrual.accruedQty > 0 && (
        <motion.p
          key={accrual.accruedQty}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-1 text-[10px] font-mono tabular-nums text-[#14F195]/85"
        >
          <Sprout className="w-3 h-3" />
          +{yieldFmt(accrual.accruedQty)} {a.assetSymbol}
          <span className="text-white/35">
            ({usd(accrual.accruedQty * p)}) · {sk(accrual.apy, 2)} % APY · +{yieldFmt(accrual.dailyQty)}/deň
          </span>
        </motion.p>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="rows"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border border-y border-border pt-1">
              {rows.map(r => (
                <div key={r.key} className="flex items-center justify-between gap-3 py-2 min-w-0">
                  <div className="min-w-0">
                    <p className={`flex items-center gap-1.5 font-mono text-[10px] ${r.text}`}>{r.icon}{r.label}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">{r.detail ?? (r.negative ? 'Dlh vedený v stablecoine' : usd(r.qty * p))}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-[11px] tabular-nums text-foreground break-all">{qtyFmt(r.qty)} {a.assetSymbol}</p>
                    <p className="font-mono text-[9px] tabular-nums text-muted-foreground">{r.negative ? usd(a.borrowUsd) : p > 0 ? usd(r.qty * p) : 'Dáta cien nedostupné'}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="pt-1.5 text-[10px] font-mono text-white/35">
              Celkom = Voľné + Delegované + Zábezpeka − Dlh = {qtyFmt(a.tokenQuantity)} {a.assetSymbol} ({usd(a.currentFiatValue)})
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <LayerTransferModal
        open={manage}
        onOpenChange={setManage}
        symbol={a.assetSymbol}
        price={p}
        apy={accrual?.apy}
        available={{
          liquid: a.liquidQty,
          staked: a.stakedQty,
          collateral: a.collateralQty,
          borrowUsd: a.borrowUsd,
        }}
        manualOverride={a.manualLayerOverride}
      />
    </div>
  );
}
