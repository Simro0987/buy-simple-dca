import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { PLHistoryChart, PLSnapshot, savePLSnapshot, getPLHistory } from '@/components/PLHistoryChart';
import { Lang } from '@/lib/i18n';
import { usePrices } from '@/hooks/usePrices';
import { TOKENS, formatUsd, formatPrice, formatQuantity, PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { CycleTriggerDashboard } from '@/components/CycleTriggerDashboard';
import {
  PROFIT_CONFIGS, TokenProfitConfig, ProfitLevel,
  getExecutedLevels, markLevelExecuted, isLevelExecuted,
  getAvgCostBasis, setAvgCostBasis, computeProfitPct, getTotalSoldPct,
  getDcaPurchases, addDcaPurchase, recalcAllAvgCosts, importFromExecutionHistory, DcaPurchase,
} from '@/lib/profitTaking';
import { CopyButton } from '@/components/CopyButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  TrendingUp, TrendingDown, ChevronDown, AlertTriangle, CheckCircle2,
  DollarSign, ShieldAlert, ExternalLink, Edit3, Lock, Plus, BarChart3, History, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { PerChainPnLSummary } from '@/components/PerChainPnLSummary';
import { ContextCTAs } from '@/components/decision/ContextCTAs';

const PROFIT_ALERT_KEY = 'profit-alert-sent';

function getAlertedLevels(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PROFIT_ALERT_KEY) || '{}'); }
  catch { return {}; }
}

function markAlertSent(tokenId: string, profitPct: number) {
  const alerted = getAlertedLevels();
  alerted[`${tokenId}_${profitPct}`] = Date.now();
  localStorage.setItem(PROFIT_ALERT_KEY, JSON.stringify(alerted));
}

function wasAlertSent(tokenId: string, profitPct: number): boolean {
  const alerted = getAlertedLevels();
  const ts = alerted[`${tokenId}_${profitPct}`];
  if (!ts) return false;
  // Cool down: 24 hours
  return Date.now() - ts < 24 * 60 * 60 * 1000;
}

async function sendProfitAlert(params: {
  chatId: string;
  token: string;
  profitPct: number;
  sellPct: number;
  currentPrice: number;
  avgCost: number;
  sellUsd: number;
  toBtcUsd: number;
  toStableUsd: number;
  btcPct: number;
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-profit-alert', {
      body: params,
    });
    if (error) throw error;
    return data?.success === true;
  } catch (e) {
    console.error('Failed to send profit alert:', e);
    return false;
  }
}

interface Props {
  lang: Lang;
  prices?: PriceData;
  athData?: AthData;
  cycleResult?: MarketCycleResult | null;
  advancedData?: AdvancedMarketData | null;
}

function loadHoldings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}');
  } catch { return {}; }
}

export function ProfitTakingPage({ lang, prices: propPrices, athData, cycleResult, advancedData }: Props) {
  const { data: hookPrices } = usePrices();
  const prices = propPrices || hookPrices;
  const portfolio = usePortfolioMetrics(prices);
  const [avgCosts, setAvgCosts] = useState<Record<string, number>>(getAvgCostBasis);
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [, forceUpdate] = useState(0);
  const [showPL, setShowPL] = useState(true);
  const [showAddPurchase, setShowAddPurchase] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseType, setPurchaseType] = useState<'market' | 'limit'>('market');
  const [costSource, setCostSource] = useState<Record<string, 'auto' | 'manual'>>({});

  // Holdings z portfólia (manual_holdings + DCA agregát) — jediný zdroj pravdy
  const holdings = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const a of portfolio.assets) {
      map[a.coingeckoId] = a.holdings;
    }
    return map;
  }, [portfolio.assets]);

  // Avg cost z portfólia (invested USD / holdings)
  const portfolioAvgCosts = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const a of portfolio.assets) {
      if (a.holdings > 0 && a.invested > 0) map[a.coingeckoId] = a.invested / a.holdings;
    }
    return map;
  }, [portfolio.assets]);

  // Auto-import from execution history on first load
  useEffect(() => {
    if (!prices) return;
    const imported = importFromExecutionHistory(prices);
    if (imported > 0) {
      toast.success(`Importovaných ${imported} nákupov z DCA histórie`);
    }
  }, [prices]);

  // Auto-recalculate avg costs: portfólio (DB) má prioritu, fallback na lokálne DCA nákupy
  useEffect(() => {
    if (!prices) return;
    const purchases = getDcaPurchases();
    const sources: Record<string, 'auto' | 'manual'> = {};
    const newBasis: Record<string, number> = { ...getAvgCostBasis() };

    for (const token of TOKENS) {
      const fromPortfolio = portfolioAvgCosts[token.id];
      if (fromPortfolio && fromPortfolio > 0) {
        newBasis[token.id] = fromPortfolio;
        sources[token.id] = 'auto';
        continue;
      }
      const tokenPurchases = purchases.filter(p => p.tokenId === token.id);
      if (tokenPurchases.length > 0) {
        const totalQty = tokenPurchases.reduce((s, p) => s + p.quantity, 0);
        const totalCost = tokenPurchases.reduce((s, p) => s + p.totalUsd, 0);
        if (totalQty > 0) {
          newBasis[token.id] = totalCost / totalQty;
          sources[token.id] = 'auto';
        }
      } else if (newBasis[token.id] && newBasis[token.id] > 0) {
        sources[token.id] = 'manual';
      }
    }

    setAvgCostBasis(newBasis);
    setAvgCosts(newBasis);
    setCostSource(sources);
  }, [prices, portfolioAvgCosts]);

  const saveAvgCost = (tokenId: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Zadaj platnú cenu');
      return;
    }
    const updated = { ...avgCosts, [tokenId]: val };
    setAvgCosts(updated);
    setAvgCostBasis(updated);
    setCostSource(prev => ({ ...prev, [tokenId]: 'manual' }));
    setEditingToken(null);
    toast.success('Priemerná cena uložená ✓');
  };

  const handleAddPurchase = (tokenId: string) => {
    const price = parseFloat(purchasePrice);
    const qty = parseFloat(purchaseQty);
    if (isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
      toast.error('Zadaj platnú cenu a množstvo');
      return;
    }
    addDcaPurchase({ tokenId, quantity: qty, priceUsd: price, totalUsd: price * qty, type: purchaseType });
    setAvgCosts(getAvgCostBasis());
    setShowAddPurchase(null);
    setPurchasePrice('');
    setPurchaseQty('');
    toast.success('Nákup zaznamenaný ✓');
    forceUpdate(n => n + 1);
  };

  const handleExecuteLevel = (tokenId: string, profitPct: number) => {
    if (isLevelExecuted(tokenId, profitPct)) return;
    markLevelExecuted(tokenId, profitPct);
    forceUpdate(n => n + 1);
    toast.success(`Level +${profitPct}% označený ako vykonaný ✓`);
  };

  // Auto-send Telegram alerts when profit levels are reached
  const alertCheckRef = useRef(false);
  useEffect(() => {
    if (!prices || alertCheckRef.current) return;
    alertCheckRef.current = true;

    const chatId = localStorage.getItem('telegram_chat_id') || '';
    if (!chatId) return;

    for (const config of PROFIT_CONFIGS) {
      const token = TOKENS.find(t => t.id === config.id)!;
      const avgCost = avgCosts[config.id] ?? 0;
      if (avgCost <= 0) continue;

      const currentPrice = prices[token.coingeckoId]?.usd ?? 0;
      if (currentPrice <= 0) continue;

      const pPct = computeProfitPct(currentPrice, avgCost);
      const holdingQty = holdings[config.id] ?? 0;

      for (let idx = 0; idx < config.levels.length; idx++) {
        const level = config.levels[idx];
        const executed = isLevelExecuted(config.id, level.profitPct);
        const prevExecuted = idx === 0 || isLevelExecuted(config.id, config.levels[idx - 1].profitPct);
        const reached = pPct >= level.profitPct;

        if (reached && !executed && prevExecuted && !wasAlertSent(config.id, level.profitPct)) {
          const sellQty = holdingQty * (level.sellPct / 100);
          const sellUsd = sellQty * currentPrice;
          const toBtcUsd = sellUsd * (level.btcPct / 100);
          const toStableUsd = sellUsd * ((100 - level.btcPct) / 100);

          sendProfitAlert({
            chatId,
            token: config.symbol,
            profitPct: pPct,
            sellPct: level.sellPct,
            currentPrice,
            avgCost,
            sellUsd,
            toBtcUsd,
            toStableUsd,
            btcPct: level.btcPct,
          }).then(sent => {
            if (sent) {
              markAlertSent(config.id, level.profitPct);
              toast.info(`📬 Telegram alert odoslaný: ${config.symbol} +${level.profitPct}%`);
            }
          });
          break; // only alert next unexecuted level per token
        }
      }
    }
  }, [prices, avgCosts, holdings]);

  // Realtime: listen for callback responses from Telegram inline buttons
  useEffect(() => {
    const channel = supabase
      .channel('profit-callbacks')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'telegram_callback_log',
          filter: 'action_type=in.(profit_sell,profit_postpone,profit_ignore)',
        },
        (payload: { new: { action_type: string; token: string; profit_pct: number } }) => {
          const { action_type, token, profit_pct } = payload.new;
          const tokenConfig = PROFIT_CONFIGS.find(c => c.symbol === token);
          if (!tokenConfig) return;

          if (action_type === 'profit_sell') {
            // Auto-mark level as executed
            const level = tokenConfig.levels.find(l => Math.abs(l.profitPct - profit_pct) < 0.5);
            if (level && !isLevelExecuted(tokenConfig.id, level.profitPct)) {
              markLevelExecuted(tokenConfig.id, level.profitPct);
              forceUpdate(n => n + 1);
              toast.success(`✅ ${token} +${profit_pct}% označený cez Telegram`);
            }
          } else if (action_type === 'profit_postpone') {
            toast.info(`⏸️ ${token} +${profit_pct}% odložený cez Telegram`);
          } else if (action_type === 'profit_ignore') {
            toast.info(`❌ ${token} +${profit_pct}% ignorovaný cez Telegram`);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Manual send handler
  const handleManualAlert = useCallback(async (config: TokenProfitConfig, level: ProfitLevel, currentPrice: number, avgCost: number) => {
    const chatId = localStorage.getItem('telegram_chat_id') || '';
    if (!chatId) {
      toast.error('Nastav Telegram Chat ID v Nastaveniach');
      return;
    }
    const holdingQty = holdings[config.id] ?? 0;
    const sellQty = holdingQty * (level.sellPct / 100);
    const sellUsd = sellQty * currentPrice;
    const toBtcUsd = sellUsd * (level.btcPct / 100);
    const toStableUsd = sellUsd * ((100 - level.btcPct) / 100);
    const pPct = computeProfitPct(currentPrice, avgCost);

    toast.loading('Odosielam Telegram alert...');
    const sent = await sendProfitAlert({
      chatId,
      token: config.symbol,
      profitPct: pPct,
      sellPct: level.sellPct,
      currentPrice,
      avgCost,
      sellUsd,
      toBtcUsd,
      toStableUsd,
      btcPct: level.btcPct,
    });
    toast.dismiss();
    if (sent) {
      markAlertSent(config.id, level.profitPct);
      toast.success('Telegram alert odoslaný ✓');
    } else {
      toast.error('Nepodarilo sa odoslať alert');
    }
  }, [holdings]);

  // P/L calculations
  const plData = useMemo(() => {
    if (!prices) return [];
    return TOKENS.map(token => {
      const avgCost = avgCosts[token.id] ?? 0;
      const currentPrice = prices[token.coingeckoId]?.usd ?? 0;
      const holdingQty = holdings[token.id] ?? 0;
      const profitPct = computeProfitPct(currentPrice, avgCost);
      const investedUsd = avgCost * holdingQty;
      const currentUsd = currentPrice * holdingQty;
      const plUsd = currentUsd - investedUsd;
      const purchases = getDcaPurchases().filter(p => p.tokenId === token.id);
      return {
        token,
        avgCost,
        currentPrice,
        holdingQty,
        profitPct,
        investedUsd,
        currentUsd,
        plUsd,
        purchaseCount: purchases.length,
      };
    });
  }, [prices, avgCosts, holdings]);

  const totalInvested = plData.reduce((s, d) => s + d.investedUsd, 0);
  const totalCurrent = plData.reduce((s, d) => s + d.currentUsd, 0);
  const totalPL = totalCurrent - totalInvested;
  const totalPLPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  // Save daily P/L snapshot
  const [plHistory, setPlHistory] = useState<PLSnapshot[]>(getPLHistory);
  useEffect(() => {
    if (totalInvested <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const btcD = plData.find(d => d.token.id === 'bitcoin');
    const ethD = plData.find(d => d.token.id === 'ethereum');
    const solD = plData.find(d => d.token.id === 'solana');
    const snapshot: PLSnapshot = {
      date: today,
      totalPL,
      totalPLPct,
      btcPL: btcD?.plUsd ?? 0,
      ethPL: ethD?.plUsd ?? 0,
      solPL: solD?.plUsd ?? 0,
    };
    savePLSnapshot(snapshot);
    setPlHistory(getPLHistory());
  }, [totalPL, totalPLPct, totalInvested, plData]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <DollarSign className="w-5 h-5" />
        Realizácia ziskov
      </h1>
      <PerChainPnLSummary prices={prices} />
      <ContextCTAs actions={['reduce_exposure', 'move_to_yield']} />
      <p className="text-xs text-muted-foreground">
        Automatická stratégia postupného predaja. Zisky → 70-80% BTC / 20-30% stablecoin.
      </p>


      {/* Cycle-Trigger Profit Engine */}
      <CycleTriggerDashboard
        lang={lang}
        prices={prices}
        athData={athData}
        cycleResult={cycleResult}
        advancedData={advancedData}
      />

      {/* Discipline Warning */}
      <div className="glass-card p-3 flex gap-2 border-warning/20 bg-warning/5">
        <ShieldAlert className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-warning">Disciplína je kľúčová</p>
          <p className="text-[10px] text-muted-foreground">
            Odchýlka od stratégie znižuje dlhodobý výnos. Neupravuj úrovne, nepreskakuj levely.
          </p>
        </div>
      </div>

      {PROFIT_CONFIGS.map(config => {
        const token = TOKENS.find(t => t.id === config.id)!;
        const currentPrice = prices?.[token.coingeckoId]?.usd ?? 0;
        const avgCost = avgCosts[config.id] ?? 0;
        const profitPct = computeProfitPct(currentPrice, avgCost);
        const holdingQty = holdings[config.id] ?? 0;
        const totalSold = getTotalSoldPct(config.id);
        const remaining = 100 - totalSold;

        return (
          <TokenProfitCard
            key={config.id}
            config={config}
            currentPrice={currentPrice}
            avgCost={avgCost}
            profitPct={profitPct}
            holdingQty={holdingQty}
            totalSold={totalSold}
            remaining={remaining}
            editing={editingToken === config.id}
            editValue={editValue}
            onStartEdit={() => { setEditingToken(config.id); setEditValue(avgCost > 0 ? avgCost.toString() : ''); }}
            onEditChange={setEditValue}
            onSaveEdit={() => saveAvgCost(config.id)}
            onCancelEdit={() => setEditingToken(null)}
            onExecuteLevel={(pct) => handleExecuteLevel(config.id, pct)}
            onSendAlert={(level) => handleManualAlert(config, level, currentPrice, avgCost)}
            showAddPurchase={showAddPurchase === config.id}
            onToggleAddPurchase={() => setShowAddPurchase(showAddPurchase === config.id ? null : config.id)}
            purchasePrice={purchasePrice}
            purchaseQty={purchaseQty}
            purchaseType={purchaseType}
            onPurchasePriceChange={setPurchasePrice}
            onPurchaseQtyChange={setPurchaseQty}
            onPurchaseTypeChange={setPurchaseType}
            onAddPurchase={() => handleAddPurchase(config.id)}
            prices={prices}
            costSource={costSource[config.id]}
          />
        );
      })}

      {/* Rebalancing reminder */}
      <div className="glass-card p-4 space-y-2">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Rebalancing pravidlá
        </h2>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>📅 <strong>Mesačne:</strong> Ak odchýlka &gt; 5% → navrhni rebalancing</p>
          <p>📅 <strong>Kvartálne:</strong> Plný rebalancing na cieľovú alokáciu</p>
          <p>🎯 Cieľ: BTC 64% / ETH 25% / SOL 11%</p>
        </div>
      </div>
    </div>
  );
}

function TokenProfitCard({
  config, currentPrice, avgCost, profitPct, holdingQty, totalSold, remaining,
  editing, editValue, onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onExecuteLevel,
  onSendAlert,
  showAddPurchase, onToggleAddPurchase, purchasePrice, purchaseQty, purchaseType,
  onPurchasePriceChange, onPurchaseQtyChange, onPurchaseTypeChange, onAddPurchase,
  prices, costSource,
}: {
  config: TokenProfitConfig;
  currentPrice: number;
  avgCost: number;
  profitPct: number;
  holdingQty: number;
  totalSold: number;
  remaining: number;
  editing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onExecuteLevel: (pct: number) => void;
  onSendAlert: (level: ProfitLevel) => void;
  showAddPurchase: boolean;
  onToggleAddPurchase: () => void;
  purchasePrice: string;
  purchaseQty: string;
  purchaseType: 'market' | 'limit';
  onPurchasePriceChange: (v: string) => void;
  onPurchaseQtyChange: (v: string) => void;
  onPurchaseTypeChange: (v: 'market' | 'limit') => void;
  onAddPurchase: () => void;
  prices?: PriceData;
  costSource?: 'auto' | 'manual';
}) {
  const [open, setOpen] = useState(false);
  const hasAvgCost = avgCost > 0;
  const purchases = getDcaPurchases().filter(p => p.tokenId === config.id);

  const nextLevel = config.levels.find(l => !isLevelExecuted(config.id, l.profitPct));
  const nextLevelReached = nextLevel && profitPct >= nextLevel.profitPct;

  const completedCount = config.levels.filter(l => isLevelExecuted(config.id, l.profitPct)).length;
  const progressPct = (completedCount / config.levels.length) * 100;

  return (
    <div className="glass-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: config.color + '20', color: config.color }}
        >
          {config.symbol.slice(0, 2)}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{config.symbol}</span>
            {nextLevelReached && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning animate-pulse">
                PREDAJ!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {hasAvgCost ? (
              <span className={`font-medium ${profitPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
              </span>
            ) : (
              <span className="text-muted-foreground">Zadaj priemernú cenu →</span>
            )}
            {purchases.length > 0 && (
              <span className="text-muted-foreground">· {purchases.length} nákupov</span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium text-foreground">{formatPrice(currentPrice)}</p>
          <ChevronDown className={`w-4 h-4 text-muted-foreground mt-1 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Avg Cost + Add Purchase */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                Priemerná nákupná cena
                {costSource === 'auto' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">AUTO</span>
                )}
                {costSource === 'manual' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">MANUÁLNE</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={onToggleAddPurchase} className="text-primary text-xs flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Nákup
                </button>
                {!editing && (
                  <button onClick={onStartEdit} className="text-primary text-xs flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Upraviť
                  </button>
                )}
              </div>
            </div>
            {editing ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={editValue}
                  onChange={e => onEditChange(e.target.value)}
                  placeholder="napr. 62000"
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
                  autoFocus
                />
                <button onClick={onSaveEdit} className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium">
                  Uložiť
                </button>
                <button onClick={onCancelEdit} className="px-2 py-1 text-muted-foreground text-xs">
                  ✕
                </button>
              </div>
            ) : (
              <p className="text-sm font-bold text-foreground">
                {hasAvgCost ? formatPrice(avgCost) : '—'}
                {purchases.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-normal ml-2">
                    (auto z {purchases.length} nákupov)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Add Purchase Form */}
          {showAddPurchase && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-foreground flex items-center gap-1">
                <Plus className="w-3 h-3" /> Zaznamenať nákup {config.symbol}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onPurchaseTypeChange('market')}
                  className={`flex-1 py-1.5 rounded text-xs font-medium ${purchaseType === 'market' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                >
                  Market
                </button>
                <button
                  onClick={() => onPurchaseTypeChange('limit')}
                  className={`flex-1 py-1.5 rounded text-xs font-medium ${purchaseType === 'limit' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                >
                  Limit
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Cena (USD)</label>
                  <input
                    type="number"
                    value={purchasePrice}
                    onChange={e => onPurchasePriceChange(e.target.value)}
                    placeholder={currentPrice > 0 ? currentPrice.toFixed(0) : '0'}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Množstvo</label>
                  <input
                    type="number"
                    value={purchaseQty}
                    onChange={e => onPurchaseQtyChange(e.target.value)}
                    placeholder="0.001"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground"
                  />
                </div>
              </div>
              {purchasePrice && purchaseQty && (
                <p className="text-[10px] text-muted-foreground">
                  Celkom: {formatUsd(parseFloat(purchasePrice) * parseFloat(purchaseQty))}
                </p>
              )}
              <button
                onClick={onAddPurchase}
                className="w-full py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground"
              >
                Zaznamenať nákup
              </button>
            </div>
          )}

          {/* Profit Summary */}
          {hasAvgCost && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-[9px] text-muted-foreground">Zisk</p>
                <p className={`text-sm font-bold ${profitPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-[9px] text-muted-foreground">Predané</p>
                <p className="text-sm font-bold text-foreground">{totalSold.toFixed(0)}%</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-[9px] text-muted-foreground">Zostatok</p>
                <p className="text-sm font-bold text-foreground">{remaining.toFixed(0)}%</p>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Progres</span>
              <span>{completedCount}/{config.levels.length} levelov</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: config.color,
                }}
              />
            </div>
          </div>

          {/* Purchase History */}
          {purchases.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary w-full">
                <History className="w-3 h-3" />
                História nákupov ({purchases.length})
                <ChevronDown className="w-3 h-3 ml-auto" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {purchases.slice(-10).reverse().map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] bg-secondary/30 rounded px-2 py-1.5">
                    <span className="text-muted-foreground">
                      {new Date(p.date).toLocaleDateString('sk')} · {p.type === 'market' ? 'Market' : 'Limit'}
                    </span>
                    <span className="text-foreground font-medium">
                      {formatQuantity(p.quantity, config.symbol)} @ {formatPrice(p.priceUsd)}
                    </span>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Profit Levels */}
          <div className="space-y-1.5">
            {config.levels.map((level, idx) => {
              const executed = isLevelExecuted(config.id, level.profitPct);
              const reached = hasAvgCost && profitPct >= level.profitPct;
              const isNext = nextLevel?.profitPct === level.profitPct;
              const prevExecuted = idx === 0 || isLevelExecuted(config.id, config.levels[idx - 1].profitPct);
              const canExecute = reached && !executed && prevExecuted;

              const sellQty = holdingQty * (level.sellPct / 100);
              const sellUsd = sellQty * currentPrice;
              const toBtc = sellUsd * (level.btcPct / 100);
              const toStable = sellUsd * ((100 - level.btcPct) / 100);

              const zoneColor = level.profitPct <= 25 ? 'border-gain/30' : level.profitPct <= 60 ? 'border-warning/30' : 'border-loss/30';
              const zoneBg = level.profitPct <= 25 ? 'bg-gain/5' : level.profitPct <= 60 ? 'bg-warning/5' : 'bg-loss/5';

              return (
                <div
                  key={level.profitPct}
                  className={`rounded-lg p-3 border transition-all ${
                    executed ? 'bg-secondary/30 border-border opacity-60'
                      : isNext && reached ? `${zoneBg} border-2 ${zoneColor} animate-pulse`
                      : `${zoneBg} ${zoneColor}`
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {executed ? (
                        <CheckCircle2 className="w-4 h-4 text-gain" />
                      ) : !prevExecuted ? (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : reached ? (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <span className="text-xs font-bold text-foreground">
                        +{level.profitPct}%
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Predaj {level.sellPct}%
                    </span>
                  </div>

                  {(reached || executed) && hasAvgCost && holdingQty > 0 && (
                    <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                      <p>Predaj: <strong className="text-foreground">{formatQuantity(sellQty, config.symbol)} {config.symbol}</strong> ({formatUsd(sellUsd)})</p>
                      {level.btcPct > 0 && (
                        <p>→ {level.btcPct}% do BTC: <strong className="text-foreground">{formatUsd(toBtc)}</strong></p>
                      )}
                      {level.btcPct < 100 && (
                        <p>→ {100 - level.btcPct}% do stablecoinu: <strong className="text-foreground">{formatUsd(toStable)}</strong></p>
                      )}
                    </div>
                  )}

                  {canExecute && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => onExecuteLevel(level.profitPct)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 active:bg-primary/20"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Označ vykonané
                      </button>
                      <button
                        onClick={() => onSendAlert(level)}
                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 active:bg-blue-500/20"
                        title="Pošli Telegram alert"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`https://app.hyperliquid.xyz/trade/${config.symbol}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-secondary text-foreground border border-border"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <CopyButton
                        text={`Predaj ${level.sellPct}% ${config.symbol} (${formatQuantity(sellQty, config.symbol)} ${config.symbol} = ${formatUsd(sellUsd)}). ${level.btcPct}% → BTC, ${100 - level.btcPct}% → stablecoin.`}
                        label=""
                      />
                    </div>
                  )}

                  {executed && (
                    <p className="text-[9px] text-gain mt-1">
                      ✓ Vykonané
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
