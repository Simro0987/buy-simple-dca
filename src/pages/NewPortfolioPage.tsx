/**
 * NewPortfolioPage — čistý CoinStats-style redesign.
 *  - Hore: celková hodnota + Unrealized PnL
 *  - Donut Core/Yield/Satelity
 *  - Zoznam držaní so sekciami; menu na riadku (Pridať tx / Vybrať zisk)
 *  - Tlačidlo Pridať aktívum (CoinGecko search → tracked_tokens)
 *
 * BTC/ETH/SOL: hodnota, PnL a RSI čerpajú z existujúcich hookov (usePortfolio, DCA-out engine).
 * Yield/Satelity: agregát z token_transactions, cena z CoinGecko live proxy.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Loader2, Settings2, Coins, Trash2 } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { usePrices } from '@/hooks/usePrices';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';
import { useTrackedTokens, useRemoveTrackedToken, type TokenCategory } from '@/hooks/useTrackedTokens';
import { useTokenTransactions, aggregatePositions } from '@/hooks/useTokenTransactions';
import { YIELD_TOKENS } from '@/lib/yieldTokens';
import { TOKENS } from '@/lib/crypto';
import { cgFetch } from '@/lib/coingecko';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AllocationDonut, TokenRow, AddAssetModal, AddTransactionModal,
  ProfitTakingModal, HistoryModal, AddAssetButton, RemoveTokenModal,
  type HoldingRow, type DonutGroup,
} from '@/components/portfolio/v2/PortfolioV2';
import { PortfolioHistoryChart } from '@/components/portfolio/v2/PortfolioHistoryChart';
import { fetchAllRSI, type DcaToken } from '@/lib/portfolio/dcaOutEngine';
import { UnifiedAssetCards } from '@/components/portfolio/UnifiedAssetCards';
import { PortfolioDefiPositions } from '@/components/portfolio/PortfolioDefiPositions';
import { HoldingsSettingsModal } from '@/components/portfolio/HoldingsSettingsModal';
import { useLivePortfolioPrices } from '@/hooks/useLivePortfolioPrices';
import { useRealizedProfit } from '@/hooks/useRealizedProfit';
import { hideToken, useHiddenTokens } from '@/lib/hiddenPortfolioTokens';
import { RemoveTokenManagerModal } from '@/components/portfolio/RemoveTokenManagerModal';
import { isPurgedToken } from '@/lib/purgedTokens';
import { nativeTicker } from '@/lib/tickerLabels';
import { BASKET_LABELS, BASKET_ORDER, basketOf } from '@/lib/assetBaskets';

/**
 * Zlúči duplicitné riadky do jedného na natívny ticker (wBTC→BTC, stETH→ETH…).
 * Primárny riadok = ten s logom (a s vyššou hodnotou); množstvá, vložený
 * kapitál a hodnota sa sčítajú, PnL sa prepočíta.
 */
function mergeRows(rows: HoldingRow[]): HoldingRow[] {
  const map = new Map<string, HoldingRow>();
  const rank = (r: HoldingRow) => (r.image_url ? 2 : 0) + (r.category === 'core' ? 1 : 0);
  for (const r of rows.filter(Boolean)) {
    const canon = nativeTicker(r.symbol).toUpperCase();
    const ex = map.get(canon);
    if (!ex) {
      map.set(canon, { ...r, symbol: canon });
      continue;
    }
    const primary = rank(r) > rank(ex) || (rank(r) === rank(ex) && r.value > ex.value) ? r : ex;
    const other = primary === r ? ex : r;
    const quantity = ex.quantity + r.quantity;
    const costBasis = ex.costBasis + r.costBasis;
    const value = ex.value + r.value;
    const pnl = value - costBasis;
    map.set(canon, {
      ...primary,
      symbol: canon,
      quantity,
      costBasis,
      value,
      pnl,
      pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
      price: primary.price > 0 ? primary.price : other.price,
      image_url: primary.image_url ?? other.image_url,
      rsi: primary.rsi ?? other.rsi,
      change7d: primary.change7d ?? other.change7d,
      trackedId: primary.trackedId ?? other.trackedId,
    });
  }
  return Array.from(map.values());
}

const CORE_IDS = ['bitcoin', 'ethereum', 'solana'];
const CORE_META: Record<string, { symbol: string; name: string; image: string }> = {
  bitcoin:  { symbol: 'BTC', name: 'Bitcoin',  image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  ethereum: { symbol: 'ETH', name: 'Ethereum', image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  solana:   { symbol: 'SOL', name: 'Solana',   image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
};

export function NewPortfolioPage({ lang }: { lang: Lang }) {
  return (
    <PortfolioProvider>
      <Inner lang={lang} />
    </PortfolioProvider>
  );
}

function Inner({ lang: _lang }: { lang: Lang }) {
  const { data: prices } = usePrices();
  const { metrics } = usePortfolio();
  const { data: tracked = [] } = useTrackedTokens();
  const { data: txs = [] } = useTokenTransactions();
  const removeTracked = useRemoveTrackedToken();

  const [showAdd, setShowAdd] = useState(false);
  const [showHoldings, setShowHoldings] = useState(false);
  const { data: livePrices } = useLivePortfolioPrices();
  const [txRow, setTxRow] = useState<HoldingRow | null>(null);
  const [tpRow, setTpRow] = useState<HoldingRow | null>(null);
  const [historyRow, setHistoryRow] = useState<HoldingRow | null>(null);
  const [removeRow, setRemoveRow] = useState<HoldingRow | null>(null);
  const [showRemoveManager, setShowRemoveManager] = useState(false);
  const hidden = useHiddenTokens();
  const qc = useQueryClient();

  // All CoinGecko IDs in the portfolio (core + yield + tracked)
  const allIds = useMemo(() => {
    const s = new Set<string>(CORE_IDS);
    for (const y of YIELD_TOKENS) s.add(y.coingeckoId);
    for (const t of tracked) s.add(t.coingecko_id);
    return Array.from(s);
  }, [tracked]);

  // Markets endpoint: provides 7d change + fresh logo (image field) for every token
  const { data: marketsMap } = useQuery({
    queryKey: ['portfolio-markets', allIds.join(',')],
    enabled: allIds.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const res = await cgFetch('/coins/markets', {
        vs_currency: 'usd',
        ids: allIds.join(','),
        price_change_percentage: '7d',
        per_page: 250,
        page: 1,
        sparkline: false,
      });
      if (!res.ok) throw new Error('CoinGecko markets failed');
      const arr = (await res.json()) as Array<{
        id: string;
        image?: string;
        price_change_percentage_7d_in_currency?: number | null;
      }>;
      const m: Record<string, { image?: string; change7d?: number }> = {};
      for (const c of arr) {
        m[c.id] = {
          image: c.image,
          change7d: c.price_change_percentage_7d_in_currency ?? undefined,
        };
      }
      return m;
    },
  });

  // Extra CoinGecko prices for yield + custom satellite tokens
  const extraIds = useMemo(() => {
    const ids = new Set<string>();
    for (const y of YIELD_TOKENS) ids.add(y.coingeckoId);
    for (const t of tracked) if (!CORE_IDS.includes(t.coingecko_id)) ids.add(t.coingecko_id);
    return Array.from(ids);
  }, [tracked]);

  const { data: extraPrices } = useQuery({
    queryKey: ['portfolio-extra-prices', extraIds.join(',')],
    enabled: extraIds.length > 0,
    queryFn: async () => {
      const res = await cgFetch('/simple/price', { ids: extraIds.join(','), vs_currencies: 'usd' });
      if (!res.ok) throw new Error('CoinGecko price fetch failed');
      return res.json() as Promise<Record<string, { usd: number }>>;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: rsiMap } = useQuery({
    queryKey: ['portfolio-rsi'],
    queryFn: fetchAllRSI,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const positions = useMemo(() => aggregatePositions(txs), [txs]);

  // Build rows
  const rows: HoldingRow[] = useMemo(() => {
    const out: HoldingRow[] = [];
    const enrich = (id: string, fallbackImage: string | null) => ({
      image: marketsMap?.[id]?.image ?? fallbackImage ?? null,
      change7d: marketsMap?.[id]?.change7d,
    });

    // CORE — BTC/ETH/SOL: metrics (DCA + manual_holdings) + token_transactions (manuálne tx)
    for (const a of metrics.assets) {
      const cg = TOKENS.find(t => t.symbol === a.symbol)!;
      const e = enrich(cg.coingeckoId, CORE_META[cg.coingeckoId]?.image ?? null);
      const pos = positions[cg.coingeckoId];
      const extraQty = pos?.quantity ?? 0;
      const extraCost = pos?.costBasis ?? 0;
      const quantity = a.holdings + extraQty;
      const costBasis = a.invested + extraCost;
      const price = a.currentPrice;
      const value = quantity * price;
      const pnl = value - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      out.push({
        key: `core:${a.symbol}`,
        coingecko_id: cg.coingeckoId,
        symbol: a.symbol,
        name: CORE_META[cg.coingeckoId]?.name ?? a.symbol,
        image_url: e.image,
        category: 'core',
        quantity,
        price,
        value,
        costBasis,
        pnl,
        pnlPct,
        rsi: rsiMap?.[a.symbol as DcaToken],
        change7d: e.change7d,
      });
    }

    // YIELD basket
    for (const y of YIELD_TOKENS) {
      const pos = positions[y.coingeckoId];
      const quantity = pos?.quantity ?? 0;
      const costBasis = pos?.costBasis ?? 0;
      const price = extraPrices?.[y.coingeckoId]?.usd ?? 0;
      const value = quantity * price;
      const pnl = value - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      const e = enrich(y.coingeckoId, null);
      out.push({
        key: `yield:${y.coingeckoId}`,
        coingecko_id: y.coingeckoId,
        symbol: y.symbol,
        name: y.symbol,
        image_url: e.image,
        category: 'yield',
        quantity,
        price,
        value,
        costBasis,
        pnl,
        pnlPct,
        change7d: e.change7d,
      });
    }

    // User-added tracked tokens
    for (const t of tracked) {
      if (CORE_IDS.includes(t.coingecko_id)) continue;
      if (YIELD_TOKENS.some(y => y.coingeckoId === t.coingecko_id)) continue;
      const pos = positions[t.coingecko_id];
      const quantity = pos?.quantity ?? 0;
      const costBasis = pos?.costBasis ?? 0;
      const price = extraPrices?.[t.coingecko_id]?.usd ?? 0;
      const value = quantity * price;
      const pnl = value - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      const e = enrich(t.coingecko_id, t.image_url);
      out.push({
        key: `tracked:${t.id}`,
        coingecko_id: t.coingecko_id,
        symbol: t.symbol,
        name: t.name,
        image_url: e.image,
        category: t.category as TokenCategory,
        quantity,
        price,
        value,
        costBasis,
        pnl,
        pnlPct,
        trackedId: t.id,
        change7d: e.change7d,
      });
    }

    // DEDUPLIKÁCIA + wBTC MERGE — jeden riadok na natívny ticker.
    // wBTC/cbBTC → BTC, stETH/wstETH → ETH, wSOL → SOL (nativeTicker).
    // Ponechávame verziu s logom a správnymi dátami, množstvá a kapitál sčítame.
    return mergeRows(out);
  }, [metrics.assets, positions, tracked, extraPrices, rsiMap, marketsMap]);

  // Vybrané zisky (realized) — počítané z DB transakcií, nezávisle od skrytia tokenu
  const realized = useRealizedProfit();

  // Skryté („odstránené“) tokeny sa nezobrazujú, ale ich zisky zostávajú v globále
  const visibleRows: HoldingRow[] = useMemo(
    () => rows
      .filter(r => !hidden.includes(r.coingecko_id) && !isPurgedToken(r.coingecko_id, r.symbol))
      .map(r => ({ ...r, realizedProfit: realized.byId[r.coingecko_id] ?? 0 })),
    [rows, hidden, realized.byId],
  );

  const totalValue = visibleRows.reduce((s, r) => s + r.value, 0);
  const totalCost = visibleRows.reduce((s, r) => s + r.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isGain = totalPnl >= 0;

  // Rovnaké štyri koše ako DCA — členstvo určuje centrálny register.
  const bySection: Record<DonutGroup, HoldingRow[]> = {
    CORE: visibleRows.filter(r => basketOf(r.symbol) === 'CORE'),
    SATELLITES: visibleRows.filter(r => basketOf(r.symbol) === 'SATELLITES'),
    HIGH_BETA: visibleRows.filter(r => basketOf(r.symbol) === 'HIGH_BETA'),
    PROXY: visibleRows.filter(r => basketOf(r.symbol) === 'PROXY'),
  };

  const isLoading = !prices && visibleRows.length === 0;

  const confirmRemove = async (row: HoldingRow) => {
    try {
      hideToken(row.coingecko_id);
      hideToken(row.symbol.toUpperCase());
      if (row.trackedId) await removeTracked.mutateAsync(row.trackedId);
      // Okamžite zastav a zahoď všetky bežiace fetch/polling loopy pre token.
      const sym = row.symbol.toUpperCase();
      const keys = [
        ['token-daily-indicators', sym],
        [`${row.symbol.toLowerCase()}-daily-indicators`],
      ];
      for (const k of keys) {
        await qc.cancelQueries({ queryKey: k });
        qc.removeQueries({ queryKey: k });
      }
      await qc.cancelQueries({ queryKey: ['live-portfolio-prices'] });
      qc.removeQueries({ queryKey: ['live-portfolio-prices'] });
      await qc.cancelQueries({ queryKey: ['harvest-daily'] });
      qc.removeQueries({ queryKey: ['harvest-daily'] });
      toast.success(`${row.symbol} odstránený — vybrané zisky zostávajú`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemoveRow(null);
      setShowRemoveManager(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase text-white/40 font-mono tracking-wider">Celková hodnota portfólia</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowHoldings(true)}
              className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/70"
            >
              <Settings2 className="w-3 h-3" /> Nastaviť
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveManager(true)}
              className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg border border-red-400/25 bg-red-500/[0.08] text-red-300"
            >
              <Trash2 className="w-3 h-3" /> Odstrániť token
            </button>
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black text-white font-mono tabular-nums mt-1">
          {formatUsd(totalValue)}
        </h1>
        <div className={`mt-1 flex items-center gap-1.5 text-sm font-mono ${isGain ? 'text-[#14F195]' : 'text-red-400'}`}>
          {isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {isGain ? '+' : ''}{formatUsd(totalPnl)}
          <span className="text-white/40">·</span>
          <span>{isGain ? '+' : ''}{totalPnlPct.toFixed(2)}%</span>
          <span className="text-white/40 text-xs ml-1">Unrealized</span>
        </div>

        {/* Realized profit — vybrané zisky (vrátane odstránených tokenov) */}
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#F7931A]/25 bg-[#F7931A]/[0.07]">
          <Coins className="w-4 h-4 text-[#F7931A]" />
          <div>
            <p className="text-[9px] uppercase tracking-wider font-mono text-white/45">Vybrané zisky (realized)</p>
            <p className="text-base font-mono font-bold text-[#F7931A] tabular-nums leading-tight">
              {realized.total >= 0 ? '+' : ''}{formatUsd(realized.total)}
            </p>
          </div>
        </div>
      </motion.section>

      {/* Donut */}
      <AllocationDonut rows={visibleRows} />

      {/* 30d portfolio history */}
      <PortfolioHistoryChart rows={visibleRows} />

      <HoldingsSettingsModal open={showHoldings} onClose={() => setShowHoldings(false)} prices={livePrices} />

      {/* Zjednotené karty: reálne PnL + Take-Profit / Harvest */}
      <UnifiedAssetCards />

      {/* DeFi pozície: Main Wallet / Supplied & Staked / Borrowed + LTV */}
      <PortfolioDefiPositions />

      {/* Add asset */}
      <AddAssetButton onClick={() => setShowAdd(true)} />

      {/* List */}
      {isLoading ? (
        <div className="py-12 flex items-center justify-center text-white/40 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Načítavam…
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="py-12 text-center text-white/40 text-sm rounded-xl border border-dashed border-white/10">
          Zatiaľ žiadne aktíva. Klikni na „Pridať aktívum" a začni budovať portfólio.
        </div>
      ) : (
        <div className="space-y-5">
          {BASKET_ORDER.map(cat => {
            const list = bySection[cat];
            if (list.length === 0) return null;
            const label = BASKET_LABELS[cat];
            return (
              <section key={cat}>
                <h2 className="text-[11px] uppercase tracking-widest text-white/45 font-mono mb-1 px-1">
                  {label}
                </h2>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.05]">
                  {list.map(r => (
                    <TokenRow
                      key={r.key}
                      row={r}
                      onAddTx={setTxRow}
                      onTakeProfit={setTpRow}
                      onShowHistory={setHistoryRow}
                      onRemove={setRemoveRow}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showRemoveManager && (
        <RemoveTokenManagerModal
          rows={visibleRows}
          onClose={() => setShowRemoveManager(false)}
          onSelect={setRemoveRow}
        />
      )}

      {showAdd     && <AddAssetModal onClose={() => setShowAdd(false)} />}
      {txRow       && <AddTransactionModal row={txRow} onClose={() => setTxRow(null)} />}
      {tpRow       && <ProfitTakingModal   row={tpRow} onClose={() => setTpRow(null)} />}
      {historyRow  && <HistoryModal        row={historyRow} onClose={() => setHistoryRow(null)} />}
      {removeRow   && (
        <RemoveTokenModal
          row={removeRow}
          onCancel={() => setRemoveRow(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}
