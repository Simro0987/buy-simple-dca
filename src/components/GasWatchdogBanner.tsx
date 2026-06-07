import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { usePrices } from '@/hooks/usePrices';
import { loadTrackedAddresses } from '@/components/wallet/TrackedAddressInputs';
import type { WalletEntry } from '@/lib/wallets';

const MIN_GAS_USD = 5;

function buildEntries(): WalletEntry[] {
  const t = loadTrackedAddresses();
  const out: WalletEntry[] = [];
  if (t.solana) out.push({ id: 'gw-sol', chain: 'sol', label: 'SOL', address: t.solana });
  if (t.evm) {
    out.push({ id: 'gw-eth', chain: 'eth', label: 'EVM', address: t.evm });
    out.push({ id: 'gw-arb', chain: 'arb', label: 'ARB', address: t.evm });
  }
  return out;
}

/**
 * Persistentný warning banner: ak natívne gas zostatky klesnú pod $5 USD
 * (SOL na Solane, ETH na L2 / Mainnet), zobrazí sa varovanie.
 */
export function GasWatchdogBanner() {
  const entries = useMemo(() => buildEntries(), []);
  const { data: balances } = useWalletBalances(entries);
  const { data: prices } = usePrices();

  const alerts = useMemo(() => {
    if (!balances || !prices) return [] as { sym: 'SOL' | 'ETH'; usd: number }[];
    const solPrice = prices.solana?.usd ?? 0;
    const ethPrice = prices.ethereum?.usd ?? 0;

    let solNative = 0;
    for (const r of balances.sol ?? []) {
      if (r.ok && r.native?.symbol === 'SOL') solNative += r.native.balance;
    }
    let ethNative = 0;
    for (const chain of ['eth', 'arb'] as const) {
      for (const r of balances[chain] ?? []) {
        if (r.ok && r.native?.symbol === 'ETH') ethNative += r.native.balance;
      }
    }

    const out: { sym: 'SOL' | 'ETH'; usd: number }[] = [];
    if (solPrice > 0 && entries.some(e => e.chain === 'sol')) {
      const usd = solNative * solPrice;
      if (usd < MIN_GAS_USD) out.push({ sym: 'SOL', usd });
    }
    if (ethPrice > 0 && entries.some(e => e.chain === 'eth' || e.chain === 'arb')) {
      const usd = ethNative * ethPrice;
      if (usd < MIN_GAS_USD) out.push({ sym: 'ETH', usd });
    }
    return out;
  }, [balances, prices, entries]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.map(a => (
        <div
          key={a.sym}
          className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-200"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-[11px] leading-snug">
            <span className="font-bold">⚠️ Pozor: Nízky zostatok na Gas!</span>{' '}
            Na peňaženke musí vždy zostať aspoň 5 USD v {a.sym} na sieťové poplatky.{' '}
            <span className="text-amber-300/80 tabular-nums">(aktuálne ≈ ${a.usd.toFixed(2)})</span>
          </p>
        </div>
      ))}
    </div>
  );
}
