import { useState, useEffect } from 'react';
import { Lang } from '@/lib/i18n';
import { TOKENS, MARKET_SPLIT, LIMIT_SPLIT, formatPrice, formatUsd, formatQuantity, calculateDCA, PriceData } from '@/lib/crypto';
import { STAKING_CONFIG } from '@/lib/wallets';
import { CheckCircle, XCircle, Circle, ClipboardList, ShoppingCart, TrendingDown, Layers, Target } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';

interface Props {
  lang: Lang;
  prices?: PriceData;
}

interface ChecklistState {
  weekId: string;
  dcaMarket: boolean;
  dcaLimit: boolean;
  stakingActions: Record<string, boolean>;
  limitMonitor: Record<string, boolean>;
}

function getCurrentWeekId(): string {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getChecklist(): ChecklistState {
  const weekId = getCurrentWeekId();
  try {
    const saved = JSON.parse(localStorage.getItem('weekly_checklist') || '{}');
    if (saved.weekId === weekId) return saved;
  } catch {
    // ignore parse error
  }
  return {
    weekId,
    dcaMarket: false,
    dcaLimit: false,
    stakingActions: {},
    limitMonitor: {},
  };
}

function saveChecklist(state: ChecklistState) {
  localStorage.setItem('weekly_checklist', JSON.stringify(state));
}

function CheckItem({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
        checked ? 'bg-gain/10 border border-gain/30' : 'bg-secondary/50 border border-border'
      }`}
    >
      {checked ? (
        <CheckCircle className="w-5 h-5 text-gain flex-shrink-0" />
      ) : (
        <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      )}
      <span className={`text-sm ${checked ? 'text-foreground line-through opacity-60' : 'text-foreground'}`}>
        {label}
      </span>
    </button>
  );
}

export function WeeklyChecklist({ lang, prices }: Props) {
  const [state, setState] = useState<ChecklistState>(getChecklist);
  const sk = lang === 'sk';
  const budget = Number(localStorage.getItem('dca-budget') || '100');
  const results = prices ? calculateDCA(budget, prices) : [];

  const update = (partial: Partial<ChecklistState>) => {
    const next = { ...state, ...partial };
    setState(next);
    saveChecklist(next);
  };

  // Calculate completion
  const totalItems = 2 + TOKENS.length + Object.keys(state.stakingActions).length;
  const doneItems = (state.dcaMarket ? 1 : 0) + (state.dcaLimit ? 1 : 0) +
    TOKENS.filter(t => state.limitMonitor[t.symbol]).length +
    Object.values(state.stakingActions).filter(Boolean).length;

  // Staking actions based on config
  const stakingTokens = STAKING_CONFIG.filter(s => s.symbol !== 'BTC');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          <ClipboardList className="w-5 h-5 inline mr-2" />
          {sk ? 'Týždenný checklist' : 'Weekly Checklist'}
        </h1>
        <span className="text-xs text-muted-foreground">{state.weekId}</span>
      </div>

      {/* 1. DCA EXECUTION */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">
            {sk ? '1. DCA Nákup' : '1. DCA Buy'} — ${budget}
          </h2>
        </div>

        {results.map(r => (
          <div key={r.token.symbol} className="bg-secondary/30 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <span className="font-medium text-foreground text-sm">{r.token.symbol}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {formatUsd(r.totalUsd)}
              </span>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <span className="text-gain">M: {formatUsd(r.marketUsd)}</span>
              <span className="mx-1">·</span>
              <span className="text-warning">L: {formatUsd(r.limitUsd)}</span>
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <CheckItem
            checked={state.dcaMarket}
            label={sk ? 'Market nákup vykonaný' : 'Market buy executed'}
            onToggle={() => update({ dcaMarket: !state.dcaMarket })}
          />
          <CheckItem
            checked={state.dcaLimit}
            label={sk ? 'Limit ordery nastavené' : 'Limit orders set'}
            onToggle={() => update({ dcaLimit: !state.dcaLimit })}
          />
        </div>
      </div>

      {/* 2. STAKING / LENDING */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">
            {sk ? '2. Staking & Lending' : '2. Staking & Lending'}
          </h2>
        </div>

        {stakingTokens.map(config => (
          <div key={config.symbol} className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{config.symbol}</p>
            {config.positions.filter(p => p.type !== 'hold').map((pos, i) => {
              const key = `${config.symbol}-${pos.label}`;
              return (
                <CheckItem
                  key={i}
                  checked={!!state.stakingActions[key]}
                  label={`${pos.label} (${pos.percentage}%)`}
                  onToggle={() => update({
                    stakingActions: { ...state.stakingActions, [key]: !state.stakingActions[key] }
                  })}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* 3. LIMIT ORDER MONITOR */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">
            {sk ? '3. Limit Monitor' : '3. Limit Monitor'}
          </h2>
        </div>

        {TOKENS.map(token => {
          const price = prices?.[token.coingeckoId]?.usd ?? 0;
          const limitPrice = price * token.limitDiscount;
          const distance = price > 0 ? ((price - limitPrice) / price * 100) : 0;
          const isNear = distance <= 3;

          return (
            <div key={token.symbol} className={`rounded-lg p-3 flex items-center justify-between ${
              isNear ? 'bg-warning/10 border border-warning/30' : 'bg-secondary/30'
            }`}>
              <div>
                <span className="font-medium text-foreground text-sm">{token.symbol}</span>
                {isNear && (
                  <span className="text-[9px] ml-2 px-1.5 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                    ⚡ {distance.toFixed(1)}%
                  </span>
                )}
                <p className="text-xs text-muted-foreground">
                  {sk ? 'Aktuálna' : 'Current'}: {formatPrice(price)} → Limit: {formatPrice(limitPrice)}
                </p>
              </div>
              <CheckItem
                checked={!!state.limitMonitor[token.symbol]}
                label=""
                onToggle={() => update({
                  limitMonitor: { ...state.limitMonitor, [token.symbol]: !state.limitMonitor[token.symbol] }
                })}
              />
            </div>
          );
        })}
      </div>

      {/* 4. EXECUTION SCORE SUMMARY */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">
              {sk ? '4. Týždenné skóre' : '4. Weekly Score'}
            </h2>
          </div>
          <span className={`text-2xl font-extrabold ${
            doneItems / Math.max(totalItems, 1) >= 0.75 ? 'text-gain' : 
            doneItems / Math.max(totalItems, 1) >= 0.5 ? 'text-warning' : 'text-loss'
          }`}>
            {Math.round((doneItems / Math.max(totalItems, 1)) * 100)}%
          </span>
        </div>
        <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${(doneItems / Math.max(totalItems, 1)) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {doneItems}/{totalItems} {sk ? 'úloh splnených' : 'tasks completed'}
        </p>
      </div>
    </div>
  );
}
