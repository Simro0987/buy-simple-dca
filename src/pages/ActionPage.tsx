import { useState, useMemo } from 'react';
import { calculateDCA, formatUsd, formatPrice, formatQuantity, TOKENS, PriceData } from '@/lib/crypto';
import { CopyButton } from '@/components/CopyButton';
import { usePrices, useFearGreed, useAthData } from '@/hooks/usePrices';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { useAppSettings } from '@/hooks/useAppSettings';
import { ExecutionPlanCard } from '@/components/dca/ExecutionPlanCard';
import { Lang } from '@/lib/i18n';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Zap, ExternalLink, ShieldCheck, ChevronDown, AlertTriangle,
  TrendingUp, TrendingDown, ArrowRight, Clock, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props { lang: Lang; }

type Priority = 'high' | 'medium' | 'low';
type ActionType = 'market_buy' | 'limit_buy' | 'sell' | 'rebalance' | 'dca';

interface SmartAction {
  id: string;
  token: string;
  tokenColor: string;
  type: ActionType;
  amountUsd: number;
  quantity: number;
  price: number;
  limitPrice?: number;
  label: string;
  reason: string;
  priority: Priority;
  deepLink?: string;
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABELS: Record<Priority, string> = { high: '🔴 Vysoká', medium: '🟡 Stredná', low: '🟢 Nízka' };
const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-loss/10 border-loss/30 text-loss',
  medium: 'bg-warning/10 border-warning/30 text-warning',
  low: 'bg-gain/10 border-gain/30 text-gain',
};

const AUTO_EXEC_KEY = 'auto-execution-prefs';

interface AutoExecPrefs {
  autoDca: boolean;
  autoLimit: boolean;
  autoRebalance: boolean;
  maxPercentPerTrade: number;
}

function getAutoExecPrefs(): AutoExecPrefs {
  try {
    return { autoDca: false, autoLimit: false, autoRebalance: false, maxPercentPerTrade: 25, ...JSON.parse(localStorage.getItem(AUTO_EXEC_KEY) || '{}') };
  } catch { return { autoDca: false, autoLimit: false, autoRebalance: false, maxPercentPerTrade: 25 }; }
}

function saveAutoExecPrefs(prefs: AutoExecPrefs) {
  localStorage.setItem(AUTO_EXEC_KEY, JSON.stringify(prefs));
}

function generateHyperliquidLink(symbol: string, side: 'buy' | 'sell'): string {
  return `https://app.hyperliquid.xyz/trade/${symbol}`;
}

function generateSmartActions(
  prices: PriceData,
  budget: number,
  signal: string,
  signalScore: number,
  fearGreedValue?: number,
  athData?: Record<string, { ath: number; ath_change_percentage: number }>,
): SmartAction[] {
  const actions: SmartAction[] = [];
  const dcaResults = calculateDCA(budget, prices);

  // DCA actions (always generated)
  for (const r of dcaResults) {
    // Market buy
    actions.push({
      id: `market-${r.token.id}`,
      token: r.token.symbol,
      tokenColor: r.token.color,
      type: 'market_buy',
      amountUsd: r.marketUsd,
      quantity: r.marketQuantity,
      price: r.currentPrice,
      label: `Kúp ${r.token.symbol} za ${formatUsd(r.marketUsd)} (Market)`,
      reason: 'Týždenný DCA nákup podľa alokácie',
      priority: 'medium',
      deepLink: generateHyperliquidLink(r.token.symbol, 'buy'),
    });

    // Limit buy
    actions.push({
      id: `limit-${r.token.id}`,
      token: r.token.symbol,
      tokenColor: r.token.color,
      type: 'limit_buy',
      amountUsd: r.limitUsd,
      quantity: r.limitQuantity,
      price: r.currentPrice,
      limitPrice: r.limitPrice,
      label: `Nastav ${r.token.symbol} limit na ${formatPrice(r.limitPrice)} (${((1 - r.token.limitDiscount) * 100).toFixed(0)}% zľava)`,
      reason: `Limit objednávka na nižšiu cenu pre lepší vstup`,
      priority: 'medium',
      deepLink: generateHyperliquidLink(r.token.symbol, 'buy'),
    });
  }

  // Signal-based actions
  if (signal === 'strong_sell' || signal === 'sell') {
    // Generate sell signals for overweight alts
    for (const token of TOKENS) {
      if (token.id === 'btc') continue; // never auto-sell BTC
      const athPct = athData?.[token.coingeckoId]?.ath_change_percentage ?? -50;
      if (athPct > -10) { // near ATH
        const price = prices[token.coingeckoId]?.usd ?? 0;
        const sellPct = signal === 'strong_sell' ? 0.20 : 0.10;
        actions.push({
          id: `sell-${token.id}`,
          token: token.symbol,
          tokenColor: token.color,
          type: 'sell',
          amountUsd: 0,
          quantity: 0,
          price,
          label: `Predaj ${(sellPct * 100).toFixed(0)}% ${token.symbol} (risk reduction)`,
          reason: signal === 'strong_sell'
            ? `Silný predajný signál + blízko ATH (${athPct.toFixed(0)}%) → zníž expozíciu`
            : `Predajný signál, ${token.symbol} blízko ATH → opatrnosť`,
          priority: 'high',
          deepLink: generateHyperliquidLink(token.symbol, 'sell'),
        });
      }
    }

    // Rebalance to BTC
    actions.push({
      id: 'rebalance-btc',
      token: 'BTC',
      tokenColor: '#F7931A',
      type: 'rebalance',
      amountUsd: 0,
      quantity: 0,
      price: prices.bitcoin?.usd ?? 0,
      label: 'Rebalancuj portfólio smerom k BTC',
      reason: 'Risk-off signál → presun do BTC pre bezpečnosť',
      priority: 'high',
    });
  }

  if (signal === 'strong_buy') {
    // Increase DCA priority
    for (const a of actions) {
      if (a.type === 'market_buy') a.priority = 'high';
    }
  }

  // Sort by priority
  return actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export function ActionPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: marketData } = useAdvancedMarket();
  const { data: settings } = useAppSettings();
  const budget = Number(settings?.default_amount ?? localStorage.getItem('dca-budget') ?? 100);
  const [executedIds, setExecutedIds] = useState<Set<string>>(new Set());
  const [autoPrefs, setAutoPrefs] = useState<AutoExecPrefs>(getAutoExecPrefs);

  const smartActions = useMemo(() => {
    if (!prices) return [];
    return generateSmartActions(
      prices,
      budget,
      marketData?.aggregatedSignal ?? 'hold',
      marketData?.signalScore ?? 0,
      fearGreed?.value,
      athData as Parameters<typeof generateSmartActions>[5],
    );
  }, [prices, budget, marketData, fearGreed, athData]);

  const markExecuted = (id: string) => {
    setExecutedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    toast.success('Akcia označená ako vykonaná ✓');
  };

  const toggleAutoPref = (key: keyof AutoExecPrefs) => {
    setAutoPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveAutoExecPrefs(next);
      return next;
    });
  };

  const highActions = smartActions.filter(a => a.priority === 'high');
  const mediumActions = smartActions.filter(a => a.priority === 'medium');
  const lowActions = smartActions.filter(a => a.priority === 'low');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Smart akcie</h1>
      </div>

      {/* Execution Plan (Monday checklist) */}
      <ExecutionPlanCard
        prices={prices}
        weeklyCapital={budget}
        regime={(marketData as any)?.regime}
        score={marketData?.signalScore}
      />

      {/* Signal Summary */}
      {marketData && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">Aktuálny signál</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
              marketData.signalScore >= 15 ? 'bg-gain/15 text-gain border-gain/30'
                : marketData.signalScore <= -15 ? 'bg-loss/15 text-loss border-loss/30'
                : 'bg-muted text-muted-foreground border-border'
            }`}>
              {marketData.aggregatedSignal === 'strong_buy' ? 'Silný nákup'
                : marketData.aggregatedSignal === 'buy' ? 'Nákup'
                : marketData.aggregatedSignal === 'sell' ? 'Predaj'
                : marketData.aggregatedSignal === 'strong_sell' ? 'Silný predaj'
                : 'Držať'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2">
            💡 {marketData.signalExplanation}
          </p>
        </div>
      )}

      {/* Failsafe Warning */}
      {marketData && (marketData.aggregatedSignal === 'strong_sell' || marketData.tradingMetrics.crowdSignal === 'long_crowded') && (
        <div className="glass-card p-3 border-warning/30 bg-warning/5 flex gap-2">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-warning">⚠️ Failsafe aktívny</p>
            <p className="text-[10px] text-muted-foreground">
              Zvýšené riziko trhu. Automatické akcie pozastavené. Vykonaj manuálne s opatrnosťou.
            </p>
          </div>
        </div>
      )}

      {/* HIGH Priority Actions */}
      {highActions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-loss flex items-center gap-1.5">
            🔴 Vysoká priorita
          </h2>
          {highActions.map(action => (
            <ActionCard key={action.id} action={action} executed={executedIds.has(action.id)} onExecute={markExecuted} />
          ))}
        </div>
      )}

      {/* MEDIUM Priority Actions */}
      {mediumActions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-warning flex items-center gap-1.5">
            🟡 Stredná priorita — DCA
          </h2>
          {mediumActions.map(action => (
            <ActionCard key={action.id} action={action} executed={executedIds.has(action.id)} onExecute={markExecuted} />
          ))}
        </div>
      )}

      {/* LOW Priority Actions */}
      {lowActions.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center justify-between py-2">
            <h2 className="text-sm font-bold text-gain flex items-center gap-1.5">
              🟢 Nízka priorita
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            {lowActions.map(action => (
              <ActionCard key={action.id} action={action} executed={executedIds.has(action.id)} onExecute={markExecuted} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Auto-Execution Settings */}
      <Collapsible>
        <div className="glass-card overflow-hidden">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Auto-exekúcia (pokročilé)
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              ⚠️ Vyžaduje API kľúč s obmedzenými právami. Žiadny leverage, žiadne futures. Len spot obchody.
            </p>

            {([
              { key: 'autoDca' as const, label: 'Auto DCA (týždenný)', desc: 'Automatický týždenný DCA nákup' },
              { key: 'autoLimit' as const, label: 'Auto limit objednávky', desc: 'Automatické nastavenie limitných objednávok' },
              { key: 'autoRebalance' as const, label: 'Auto rebalancing', desc: 'Automatický rebalancing pri veľkej odchýlke' },
            ]).map(({ key, label, desc }) => (
              <button
                key={key}
                onClick={() => toggleAutoPref(key)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                  autoPrefs[key] ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 border border-border'
                }`}
              >
                <div className="text-left">
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors ${autoPrefs[key] ? 'bg-primary' : 'bg-secondary'}`}>
                  <div className={`w-4 h-4 rounded-full bg-background shadow-sm transition-transform mt-0.5 ${autoPrefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>
            ))}

            <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border">
              <div>
                <p className="text-xs font-medium text-foreground">Max % na obchod</p>
                <p className="text-[10px] text-muted-foreground">Bezpečnostný limit</p>
              </div>
              <span className="text-sm font-bold text-foreground">{autoPrefs.maxPercentPerTrade}%</span>
            </div>

            <div className="bg-loss/5 border border-loss/20 rounded-lg p-3 flex gap-2">
              <ShieldCheck className="w-4 h-4 text-loss flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                <strong className="text-loss">Bezpečnosť:</strong> Žiadny leverage, žiadne perpetuály. Len spotové obchody. 
                Ak API zlyhá alebo cena sa prudko pohne → akcia sa zruší a dostaneš alert.
              </p>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Execution Stats */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Vykonané akcie</p>
          <p className="text-sm font-bold text-foreground">
            {executedIds.size} / {smartActions.length}
          </p>
        </div>
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-gain rounded-full transition-all"
            style={{ width: `${smartActions.length > 0 ? (executedIds.size / smartActions.length) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ActionCard({ action, executed, onExecute }: {
  action: SmartAction; executed: boolean; onExecute: (id: string) => void;
}) {
  const typeIcon = action.type === 'sell' ? TrendingDown : action.type === 'rebalance' ? ArrowRight : TrendingUp;
  const TypeIcon = typeIcon;

  return (
    <div className={`glass-card p-3 space-y-2 transition-all ${executed ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
          style={{ backgroundColor: action.tokenColor + '20', color: action.tokenColor }}
        >
          {action.token.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{action.label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{action.reason}</p>
          {action.limitPrice && (
            <p className="text-[10px] text-warning mt-0.5">
              Limit: {formatPrice(action.limitPrice)} | Aktuálna: {formatPrice(action.price)}
            </p>
          )}
        </div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_COLORS[action.priority]}`}>
          {action.priority === 'high' ? 'HIGH' : action.priority === 'medium' ? 'MED' : 'LOW'}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onExecute(action.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
            executed
              ? 'bg-gain/15 text-gain border border-gain/30'
              : 'bg-primary/10 text-primary border border-primary/30 active:bg-primary/20'
          }`}
        >
          {executed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <TypeIcon className="w-3.5 h-3.5" />}
          {executed ? 'Vykonané ✓' : 'Označ vykonané'}
        </button>

        {action.deepLink && (
          <a
            href={action.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-secondary text-foreground border border-border active:bg-secondary/80"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Obchoduj
          </a>
        )}

        <CopyButton
          text={action.label}
          label=""
        />
      </div>
    </div>
  );
}
