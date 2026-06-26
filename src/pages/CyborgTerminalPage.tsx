/**
 * Cyborg Trading Terminal — standalone route /cyborg-terminal
 * Dark cyberpunk UI with global Zustand state, per-asset action plans,
 * smart validation, and null-safe fallbacks throughout.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Coins, Layers, Shield, Wallet, Zap, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useCyborgTerminal, type CyborgAsset, type AssetBalances } from '@/stores/cyborgTerminalStore';
import { usePrices } from '@/hooks/usePrices';
import { TOKENS, formatUsd } from '@/lib/crypto';

const ASSETS: CyborgAsset[] = ['BTC', 'ETH', 'SOL'];

const ASSET_META: Record<CyborgAsset, { glow: string; ring: string; text: string }> = {
  BTC: { glow: 'shadow-[0_0_24px_rgba(247,147,26,0.35)]', ring: 'ring-[#F7931A]/40', text: 'text-[#F7931A]' },
  ETH: { glow: 'shadow-[0_0_24px_rgba(110,134,232,0.35)]', ring: 'ring-[#627EEA]/40', text: 'text-[#627EEA]' },
  SOL: { glow: 'shadow-[0_0_24px_rgba(20,241,149,0.35)]', ring: 'ring-[#14F195]/40', text: 'text-[#14F195]' },
};

function fmtQty(n: number | undefined, digits = 4): string {
  const v = Number.isFinite(n) ? (n as number) : 0;
  return v.toLocaleString('sk-SK', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function getPrice(prices: ReturnType<typeof usePrices>['data'], asset: CyborgAsset): number {
  const id = TOKENS.find(t => t.symbol === asset)?.coingeckoId;
  return (id && prices?.[id]?.usd) ?? 0;
}

// ─── Position Overview (read-only mirror of global state) ────────
function PositionOverview({ asset, balances, price }: { asset: CyborgAsset; balances: AssetBalances; price: number }) {
  const cells: { label: string; qty: number; icon: typeof Wallet }[] = [
    { label: 'Wallet',     qty: balances.wallet ?? 0,     icon: Wallet },
    { label: 'Staked',     qty: balances.staked ?? 0,     icon: Coins },
    { label: 'Collateral', qty: balances.collateral ?? 0, icon: Shield },
    { label: 'Debt',       qty: balances.debt ?? 0,       icon: Zap },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {cells.map(({ label, qty, icon: Icon }) => (
        <div
          key={label}
          className="rounded-lg bg-black/40 border border-white/[0.06] p-2 transition-all duration-300"
        >
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/40">
            <Icon className="w-2.5 h-2.5" />{label}
          </div>
          <div className="font-mono text-xs text-white mt-1 tabular-nums">{fmtQty(qty)}</div>
          <div className="text-[9px] text-white/30 font-mono">{formatUsd((qty ?? 0) * (price ?? 0))}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Action row ──────────────────────────────────────────────────
function ActionRow({
  label, available, onExecute, disabledReason, accent,
}: {
  label: string; available: number; onExecute: (qty: number) => void;
  disabledReason?: string; accent: string;
}) {
  const [val, setVal] = useState('');
  const qty = parseFloat(val) || 0;
  const tooMuch = qty > (available ?? 0);
  const disabled = !!disabledReason || qty <= 0 || tooMuch;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-white/50 font-mono">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setVal(String(available ?? 0))}
          className="text-white/40 hover:text-white/80 underline-offset-2 hover:underline"
        >
          MAX {fmtQty(available)}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="number" min="0" step="any" inputMode="decimal"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => { onExecute(qty); setVal(''); }}
          className={`px-3 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
            disabled
              ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
              : `${accent} text-black hover:brightness-110 active:scale-95`
          }`}
        >
          Execute
        </button>
      </div>
      {disabledReason && (
        <div className="text-[10px] text-amber-400/80 font-mono flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {disabledReason} —{' '}
          <Link to="/" className="underline hover:text-amber-300">Swap najprv</Link>
        </div>
      )}
      {!disabledReason && tooMuch && (
        <div className="text-[10px] text-rose-400/80 font-mono">Nedostatok balance ({fmtQty(available)}).</div>
      )}
    </div>
  );
}

// ─── Action Plan card ────────────────────────────────────────────
function ActionPlanCard({ asset, price }: { asset: CyborgAsset; price: number }) {
  const balances = useCyborgTerminal(s => s.balances?.[asset] ?? { wallet: 0, staked: 0, collateral: 0, debt: 0 });
  const { stake, unstake, supply, withdraw, borrow, repay, deposit } = useCyborgTerminal();
  const meta = ASSET_META[asset];

  const collateral = balances.collateral ?? 0;
  const debt = balances.debt ?? 0;
  const ltv = collateral > 0 ? (debt / collateral) * 100 : 0;
  const showRiskWarnings = collateral > 0;
  const ltvColor = ltv > 75 ? 'text-rose-400' : ltv > 50 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] p-4 ring-1 ${meta.ring} ${meta.glow} transition-all duration-500`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center font-bold text-xs ${meta.text}`}>
            {asset}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Tactical Engine</div>
            <div className="text-sm font-bold text-white">{asset} Action Plan</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase text-white/40 font-mono">Spot</div>
          <div className="font-mono text-xs text-white">{formatUsd(price)}</div>
        </div>
      </div>

      {/* Position overview */}
      <PositionOverview asset={asset} balances={balances} price={price} />

      {/* Test deposit (sandbox) */}
      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-2 flex items-center gap-1">
          <ArrowLeftRight className="w-3 h-3" /> Capital Bridge
        </div>
        <ActionRow
          label="Deposit do walletu (z externého zdroja)"
          available={Number.POSITIVE_INFINITY}
          onExecute={(q) => deposit(asset, q)}
          accent="bg-white/80"
        />
      </div>

      {/* Layer 1: Staking */}
      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-2 flex items-center gap-1">
          <Layers className="w-3 h-3" /> Layer 1 · Staking
        </div>
        <div className="space-y-2">
          <ActionRow
            label="Deposit to Stake"
            available={balances.wallet ?? 0}
            onExecute={(q) => stake(asset, q)}
            disabledReason={(balances.wallet ?? 0) <= 0 ? 'Wallet je prázdny' : undefined}
            accent="bg-emerald-400"
          />
          <ActionRow
            label="Unstake → Wallet"
            available={balances.staked ?? 0}
            onExecute={(q) => unstake(asset, q)}
            disabledReason={(balances.staked ?? 0) <= 0 ? 'Žiadne staked aktíva' : undefined}
            accent="bg-cyan-400"
          />
        </div>
      </div>

      {/* Layer 3: Collateral / Borrowing */}
      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono flex items-center gap-1">
            <Shield className="w-3 h-3" /> Layer 3 · Collateral & Borrow
          </div>
          <div className={`text-[10px] font-mono font-bold ${ltvColor}`}>LTV {ltv.toFixed(1)}%</div>
        </div>
        <div className="space-y-2">
          <ActionRow
            label="Supply Collateral"
            available={balances.wallet ?? 0}
            onExecute={(q) => supply(asset, q)}
            disabledReason={(balances.wallet ?? 0) <= 0 ? 'Wallet je prázdny' : undefined}
            accent="bg-fuchsia-400"
          />
          <ActionRow
            label="Withdraw Collateral"
            available={balances.collateral ?? 0}
            onExecute={(q) => withdraw(asset, q)}
            disabledReason={collateral <= 0 ? 'Žiaden collateral' : undefined}
            accent="bg-violet-400"
          />
          <ActionRow
            label="Borrow"
            available={Math.max(0, collateral * 0.75 - debt)}
            onExecute={(q) => borrow(asset, q)}
            disabledReason={collateral <= 0 ? 'Najprv supply collateral' : undefined}
            accent="bg-purple-400"
          />
          <ActionRow
            label="Repay Debt"
            available={Math.min(balances.wallet ?? 0, debt)}
            onExecute={(q) => repay(asset, q)}
            disabledReason={debt <= 0 ? 'Žiaden debt' : (balances.wallet ?? 0) <= 0 ? 'Wallet je prázdny' : undefined}
            accent="bg-pink-400"
          />
        </div>

        {/* Smart risk panel — only when collateral > 0 */}
        {showRiskWarnings ? (
          <div className="mt-3 rounded-lg bg-black/40 border border-white/[0.06] p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1">Retreat Orders</div>
            {ltv > 75 ? (
              <div className="text-[11px] text-rose-300 font-mono flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                Likvidačné riziko: LTV {ltv.toFixed(1)}% &gt; 75%. Splať debt alebo pridaj collateral.
              </div>
            ) : ltv > 50 ? (
              <div className="text-[11px] text-amber-300 font-mono">Upozornenie: LTV {ltv.toFixed(1)}% — sleduj cenovú akciu.</div>
            ) : (
              <div className="text-[11px] text-emerald-300/80 font-mono">Pozícia stabilná. Likvidácia &gt; 75% LTV.</div>
            )}
          </div>
        ) : (
          <div className="mt-3 text-[10px] text-white/30 font-mono italic">
            LTV 0% — žiadne riziko (collateral je prázdny).
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Portfolio summary (top section) ─────────────────────────────
function PortfolioSummary({ prices }: { prices: ReturnType<typeof usePrices>['data'] }) {
  const balancesMap = useCyborgTerminal(s => s.balances);
  const totals = useMemo(() => {
    let wallet = 0, staked = 0, collateral = 0, debt = 0;
    for (const a of ASSETS) {
      const b = balancesMap?.[a] ?? { wallet: 0, staked: 0, collateral: 0, debt: 0 };
      const p = getPrice(prices, a);
      wallet     += (b.wallet ?? 0) * p;
      staked     += (b.staked ?? 0) * p;
      collateral += (b.collateral ?? 0) * p;
      debt       += (b.debt ?? 0) * p;
    }
    return { wallet, staked, collateral, debt, net: wallet + staked + collateral - debt };
  }, [balancesMap, prices]);

  const cells = [
    { label: 'Wallet', value: totals.wallet, color: 'text-white' },
    { label: 'Staked', value: totals.staked, color: 'text-emerald-300' },
    { label: 'Collateral', value: totals.collateral, color: 'text-fuchsia-300' },
    { label: 'Debt', value: totals.debt, color: 'text-rose-300' },
  ];

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#1a0b2e]/60 to-[#0a0a1e]/60 border border-fuchsia-500/20 p-5 ring-1 ring-fuchsia-500/10 shadow-[0_0_40px_rgba(217,70,239,0.15)]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-300/70 font-mono">Net Position · USD</div>
        <div className="text-[10px] text-emerald-300/70 font-mono">● LIVE</div>
      </div>
      <div className="font-mono text-3xl font-bold text-white tabular-nums tracking-tight transition-all duration-300">
        {formatUsd(totals.net)}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {cells.map(c => (
          <div key={c.label} className="rounded-lg bg-black/50 border border-white/[0.06] p-2">
            <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{c.label}</div>
            <div className={`font-mono text-xs font-bold mt-1 ${c.color} tabular-nums`}>
              {formatUsd(c.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────
export default function CyborgTerminalPage() {
  const { data: prices } = usePrices();
  const reset = useCyborgTerminal(s => s.reset);

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-x-hidden">
      {/* ambient blobs */}
      <div className="fixed inset-0 pointer-events-none -z-10" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-[28rem] h-[28rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #d946ef 0%, transparent 65%)', opacity: 0.1 }} />
        <div className="absolute top-1/3 -right-40 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #14F195 0%, transparent 65%)', opacity: 0.08 }} />
      </div>

      <header className="max-w-2xl mx-auto px-4 pt-6 pb-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white font-mono">
          <ArrowLeft className="w-3.5 h-3.5" /> Späť
        </Link>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300/70 font-mono">CYBORG</div>
          <div className="text-sm font-bold tracking-wide">Trading Terminal</div>
        </div>
        <button
          type="button"
          onClick={() => { if (confirm('Resetnúť všetky balances?')) reset(); }}
          className="text-[10px] text-white/40 hover:text-rose-300 font-mono"
        >
          Reset
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-12 space-y-4">
        <PortfolioSummary prices={prices} />
        {ASSETS.map(a => (
          <ActionPlanCard key={a} asset={a} price={getPrice(prices, a)} />
        ))}
      </main>
    </div>
  );
}
