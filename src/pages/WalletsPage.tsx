import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Wallet, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { WalletEntry, ChainId, loadWallets, saveWallets, getChainLabel, getChainColor, getExplorerUrl } from '@/lib/wallets';
import { useWalletBalances, OnChainWalletResult } from '@/hooks/useWalletBalances';
import { Input } from '@/components/ui/input';
import { usePrices } from '@/hooks/usePrices';
import { formatUsd } from '@/lib/crypto';
import { TrackedAddressInputs } from '@/components/wallet/TrackedAddressInputs';

interface Props { lang: Lang; }

const CHAINS: ChainId[] = ['btc', 'eth', 'sol', 'arb'];

function formatRelative(ts: number | undefined, lang: Lang, now: number): string {
  if (!ts) return lang === 'sk' ? 'zatiaľ nikdy' : 'never';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 10) return lang === 'sk' ? 'Práve teraz' : 'Just now';
  if (diff < 60) return lang === 'sk' ? `pred ${diff} s` : `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return lang === 'sk' ? `pred ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'sk' ? `pred ${h} h` : `${h}h ago`;
  return new Date(ts).toLocaleTimeString();
}

export function WalletsPage({ lang }: Props) {
  const [wallets, setWallets] = useState<WalletEntry[]>(loadWallets);
  const [adding, setAdding] = useState(false);
  const [newChain, setNewChain] = useState<ChainId>('btc');
  const [newAddress, setNewAddress] = useState('');
  const { data: balances, isFetching, refetch, error, dataUpdatedAt } = useWalletBalances(wallets);
  const { data: prices } = usePrices();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const updatedLabel = formatRelative(dataUpdatedAt, lang, now);

  const findResult = (chain: ChainId, address: string): OnChainWalletResult | undefined => {
    if (!balances) return undefined;
    return balances[chain]?.find(r => r.address === address);
  };

  useEffect(() => { saveWallets(wallets); }, [wallets]);

  const addWallet = () => {
    if (!newAddress.trim()) return;
    const entry: WalletEntry = {
      id: crypto.randomUUID(),
      chain: newChain,
      label: getChainLabel(newChain),
      address: newAddress.trim(),
    };
    setWallets(prev => [...prev, entry]);
    setNewAddress('');
    setAdding(false);
  };

  const removeWallet = (id: string) => {
    setWallets(prev => prev.filter(w => w.id !== id));
  };

  const grouped = CHAINS.map(chain => ({
    chain,
    label: getChainLabel(chain),
    color: getChainColor(chain),
    wallets: wallets.filter(w => w.chain === chain),
  })).filter(g => g.wallets.length > 0);

  // Total on-chain value in USD
  const totalUsd = useMemo(() => {
    if (!balances || !prices) return 0;
    let total = 0;
    for (const chain of CHAINS) {
      for (const r of balances[chain] ?? []) {
        if (!r.ok) continue;
        if (r.balanceBtc) total += r.balanceBtc * (prices.bitcoin?.usd ?? 0);
        if (r.native) total += r.native.balance * (prices[r.native.coingeckoId]?.usd ?? 0);
        for (const tok of r.tokens ?? []) {
          if (tok.coingeckoId && prices[tok.coingeckoId]) {
            total += tok.balance * prices[tok.coingeckoId].usd;
          }
        }
      }
    }
    return total;
  }, [balances, prices]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">
          {lang === 'sk' ? 'Peňaženky (On-chain)' : 'Wallets (On-chain)'}
        </h1>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-muted-foreground text-right leading-tight hidden xs:block">
            <div className="uppercase tracking-wide">
              {lang === 'sk' ? 'Zostatky aktualizované' : 'Balances updated'}
            </div>
            <div className="text-foreground/80 tabular-nums">{updatedLabel}</div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching || wallets.length === 0}
            aria-label={lang === 'sk' ? 'Obnoviť zostatky' : 'Refresh balances'}
            title={lang === 'sk' ? 'Obnoviť zostatky' : 'Refresh balances'}
            className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setAdding(!adding)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {lang === 'sk' ? 'Pridať' : 'Add'}
          </button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground sm:hidden -mt-1">
        {lang === 'sk' ? 'Zostatky aktualizované: ' : 'Balances updated: '}
        <span className="text-foreground/80 tabular-nums">{updatedLabel}</span>
      </div>

      <TrackedAddressInputs lang={lang} />

      <div className="glass-card p-3 text-[11px] text-muted-foreground leading-relaxed">
        {lang === 'sk'
          ? 'Read-only sledovanie balance. Manuálne zadané holdings ostávajú primárny zdroj pravdy.'
          : 'Read-only balance tracking. Manual holdings remain the primary source of truth.'}
      </div>

      {error && (
        <div className="glass-card p-3 flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{lang === 'sk' ? 'Chyba pri načítaní balance. Skús znova.' : 'Error loading balances. Try again.'}</span>
        </div>
      )}

      {adding && (
        <div className="glass-card p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {CHAINS.map(chain => (
              <button
                key={chain}
                onClick={() => setNewChain(chain)}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  newChain === chain
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {chain.toUpperCase()}
              </button>
            ))}
          </div>
          <Input
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            placeholder={lang === 'sk' ? 'Zadaj adresu peňaženky' : 'Enter wallet address'}
            className="text-sm"
          />
          <button
            onClick={addWallet}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm"
          >
            {lang === 'sk' ? 'Uložiť' : 'Save'}
          </button>
        </div>
      )}

      {wallets.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">
            {lang === 'sk' ? 'Spolu on-chain (USD)' : 'Total on-chain (USD)'}
          </p>
          <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
            {formatUsd(totalUsd)}
          </p>
        </div>
      )}

      {grouped.length === 0 && !adding && (
        <div className="glass-card p-8 flex flex-col items-center gap-3 text-center">
          <Wallet className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {lang === 'sk'
              ? 'Zatiaľ žiadne peňaženky. Pridaj adresu pre sledovanie.'
              : 'No wallets yet. Add an address to track.'}
          </p>
        </div>
      )}

      {grouped.map(({ chain, label, color, wallets: chainWallets }) => (
        <div key={chain} className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="font-semibold text-foreground text-sm">{label}</span>
          </div>
          {chainWallets.map(w => {
            const result = findResult(w.chain, w.address);
            return (
              <div key={w.id} className="bg-secondary/50 rounded-lg px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-muted-foreground truncate">{w.address}</p>
                    {result?.ok === false && (
                      <p className="text-[10px] text-destructive mt-0.5">{result.error}</p>
                    )}
                    {!result && isFetching && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{lang === 'sk' ? 'Načítavam…' : 'Loading…'}</p>
                    )}
                  </div>
                  <a
                    href={getExplorerUrl(w.chain, w.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                    aria-label="Explorer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => removeWallet(w.id)}
                    className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {result?.ok && (
                  <div className="space-y-1 pt-1 border-t border-border/50">
                    {w.chain === 'btc' && result.balanceBtc !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-foreground">BTC</span>
                        <span className="font-semibold text-foreground">{result.balanceBtc.toFixed(8)}</span>
                      </div>
                    )}
                    {result.native && (
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-foreground">{result.native.symbol}</span>
                        <span className="font-semibold text-foreground">{result.native.balance.toFixed(6)}</span>
                      </div>
                    )}
                    {result.tokens && result.tokens.length > 0 && (
                      <div className="space-y-0.5 pt-1">
                        {result.tokens.map(tok => (
                          <div key={tok.contract ?? tok.mint} className="flex justify-between text-[11px]">
                            <span className="font-mono text-muted-foreground truncate max-w-[60%]">{tok.symbol}</span>
                            <span className="text-foreground">{tok.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
