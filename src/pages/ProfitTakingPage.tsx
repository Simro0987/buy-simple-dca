import { useState, useMemo } from 'react';
import { Lang } from '@/lib/i18n';
import { usePrices } from '@/hooks/usePrices';
import { TOKENS, formatUsd, formatPrice, formatQuantity, PriceData } from '@/lib/crypto';
import {
  PROFIT_CONFIGS, TokenProfitConfig, ProfitLevel,
  getExecutedLevels, markLevelExecuted, isLevelExecuted,
  getAvgCostBasis, setAvgCostBasis, computeProfitPct, getTotalSoldPct,
} from '@/lib/profitTaking';
import { CopyButton } from '@/components/CopyButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  TrendingUp, TrendingDown, ChevronDown, AlertTriangle, CheckCircle2,
  DollarSign, ShieldAlert, ExternalLink, Edit3, Lock,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props { lang: Lang; }

function loadHoldings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}');
  } catch { return {}; }
}

export function ProfitTakingPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const [avgCosts, setAvgCosts] = useState<Record<string, number>>(getAvgCostBasis);
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [, forceUpdate] = useState(0);
  const holdings = loadHoldings();

  const saveAvgCost = (tokenId: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Zadaj platnú cenu');
      return;
    }
    const updated = { ...avgCosts, [tokenId]: val };
    setAvgCosts(updated);
    setAvgCostBasis(updated);
    setEditingToken(null);
    toast.success('Priemerná cena uložená ✓');
  };

  const handleExecuteLevel = (tokenId: string, profitPct: number) => {
    if (isLevelExecuted(tokenId, profitPct)) return;
    markLevelExecuted(tokenId, profitPct);
    forceUpdate(n => n + 1);
    toast.success(`Level +${profitPct}% označený ako vykonaný ✓`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <DollarSign className="w-5 h-5" />
        Realizácia ziskov
      </h1>
      <p className="text-xs text-muted-foreground">
        Automatická stratégia postupného predaja. Zisky → 70-80% BTC / 20-30% stablecoin.
      </p>

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
            prices={prices}
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
          <p>🎯 Cieľ: BTC 59% / ETH 25% / SOL 11% / HYPE 5%</p>
        </div>
      </div>
    </div>
  );
}

function TokenProfitCard({
  config, currentPrice, avgCost, profitPct, holdingQty, totalSold, remaining,
  editing, editValue, onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onExecuteLevel, prices,
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
  prices?: PriceData;
}) {
  const [open, setOpen] = useState(false);
  const hasAvgCost = avgCost > 0;

  // Find next active level
  const nextLevel = config.levels.find(l => !isLevelExecuted(config.id, l.profitPct));
  const nextLevelReached = nextLevel && profitPct >= nextLevel.profitPct;

  // Progress: how many levels completed
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
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium text-foreground">{formatPrice(currentPrice)}</p>
          <ChevronDown className={`w-4 h-4 text-muted-foreground mt-1 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Avg Cost Input */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Priemerná nákupná cena</span>
              {!editing && (
                <button onClick={onStartEdit} className="text-primary text-xs flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Upraviť
                </button>
              )}
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
              </p>
            )}
          </div>

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

          {/* Profit Levels */}
          <div className="space-y-1.5">
            {config.levels.map((level, idx) => {
              const executed = isLevelExecuted(config.id, level.profitPct);
              const reached = hasAvgCost && profitPct >= level.profitPct;
              const isNext = nextLevel?.profitPct === level.profitPct;
              const prevExecuted = idx === 0 || isLevelExecuted(config.id, config.levels[idx - 1].profitPct);
              const canExecute = reached && !executed && prevExecuted;

              // Compute exact amounts
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

                  {/* Details when reached or executed */}
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

                  {/* Action buttons */}
                  {canExecute && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => onExecuteLevel(level.profitPct)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 active:bg-primary/20"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Označ vykonané
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
