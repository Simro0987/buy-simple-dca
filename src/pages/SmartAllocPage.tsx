import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Shield, TrendingUp, Landmark, Ban, Sparkles, Zap, Calculator } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { usePrices } from '@/hooks/usePrices';
import { useDefiApys } from '@/hooks/useDefiApys';
import { computeSmartAllocation, HoldingInput, AllocationAction } from '@/lib/allocation';
import { formatUsd } from '@/lib/crypto';
import { STAKING_CONFIG } from '@/lib/wallets';
import { ExactBreakdown } from '@/components/ExactBreakdown';

interface Props {
  lang: Lang;
}

const STORAGE_KEY = 'smart-alloc-holdings';

function loadHoldings(): HoldingInput {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { btc: 0, eth: 0, sol: 0, hype: 0 };
  } catch {
    return { btc: 0, eth: 0, sol: 0, hype: 0 };
  }
}

function saveHoldings(h: HoldingInput) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
}

function actionIcon(type: AllocationAction['type']) {
  switch (type) {
    case 'hold': return Shield;
    case 'stake': return TrendingUp;
    case 'lend': return Landmark;
    case 'skip': return Ban;
    default: return Shield;
  }
}

function actionColor(type: AllocationAction['type']) {
  switch (type) {
    case 'hold': return 'text-blue-400';
    case 'stake': return 'text-green-400';
    case 'lend': return 'text-yellow-400';
    case 'skip': return 'text-muted-foreground';
  }
}

function getLiveApy(pos: { label: string; protocol?: string; apy?: number; type?: string }, apys?: import('@/hooks/useDefiApys').DefiApyData | null): number | null {
  if (!apys) return pos.apy ?? null;
  if (pos.protocol === 'Rocket Pool') return apys.rocketPool;
  if (pos.label.includes('wstETH') && pos.type !== 'lending') return apys.lido;
  if (pos.protocol === 'Aave V3') return apys.aaveEth;
  if (pos.protocol === 'Jito') return apys.jito;
  if (pos.protocol === 'Kamino') return apys.kaminoSol;
  if (pos.label === 'Native staking') return apys.hypeStaking;
  return pos.apy ?? null;
}

export function SmartAllocPage({ lang }: Props) {
  const sk = lang === 'sk';
  const [holdings, setHoldings] = useState<HoldingInput>(loadHoldings);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<'exact' | 'smart'>('exact');
  const { data: prices } = usePrices();
  const { data: apys, isFetching: apyLoading } = useDefiApys();

  const updateField = (field: keyof HoldingInput, val: string) => {
    const num = parseFloat(val) || 0;
    const next = { ...holdings, [field]: num };
    setHoldings(next);
    saveHoldings(next);
  };

  const results = useMemo(() => {
    if (!prices) return null;
    return computeSmartAllocation(holdings, prices, lang, apys ?? undefined);
  }, [holdings, prices, lang, apys]);

  const hasAnyHolding = holdings.btc > 0 || holdings.eth > 0 || holdings.sol > 0 || holdings.hype > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">
          {sk ? 'Čo spraviť teraz' : 'What to do now'}
        </h1>
      </div>
      <p className="text-xs text-muted-foreground">
        {sk
          ? 'Zadaj držané množstvá a dostaneš smart odporúčania. Min. akcia: $200.'
          : 'Enter your holdings to get smart recommendations. Min. action: $200.'}
      </p>
      <div className="flex items-center gap-1.5 text-[10px]">
        <Zap className="w-3 h-3 text-green-400" />
        <span className={apyLoading ? 'text-muted-foreground animate-pulse' : 'text-green-400'}>
          {apyLoading
            ? (sk ? 'Načítavam APY...' : 'Loading APY...')
            : (sk ? 'Live APY z DefiLlama' : 'Live APY from DefiLlama')}
        </span>
      </div>

      {/* Holdings Input */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm text-foreground">
            {sk ? 'Moje držby' : 'My Holdings'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(['btc', 'eth', 'sol', 'hype'] as const).map(key => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase">{key}</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={holdings[key] || ''}
                  onChange={e => updateField(key, e.target.value)}
                  className="h-9 text-sm bg-background border-border"
                />
              </div>
            ))}
          </div>

          {/* Advanced: staked/lent amounts */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              {sk ? 'Už staknuté / požičané' : 'Already staked / lent'}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">ETH staked</label>
                  <Input type="number" step="any" min="0" placeholder="0"
                    value={holdings.stakedEth || ''}
                    onChange={e => updateField('stakedEth', e.target.value)}
                    className="h-8 text-xs bg-background border-border" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">ETH lent</label>
                  <Input type="number" step="any" min="0" placeholder="0"
                    value={holdings.lentEth || ''}
                    onChange={e => updateField('lentEth', e.target.value)}
                    className="h-8 text-xs bg-background border-border" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">SOL staked</label>
                  <Input type="number" step="any" min="0" placeholder="0"
                    value={holdings.stakedSol || ''}
                    onChange={e => updateField('stakedSol', e.target.value)}
                    className="h-8 text-xs bg-background border-border" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">SOL lent</label>
                  <Input type="number" step="any" min="0" placeholder="0"
                    value={holdings.lentSol || ''}
                    onChange={e => updateField('lentSol', e.target.value)}
                    className="h-8 text-xs bg-background border-border" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">HYPE staked</label>
                  <Input type="number" step="any" min="0" placeholder="0"
                    value={holdings.stakedHype || ''}
                    onChange={e => updateField('stakedHype', e.target.value)}
                    className="h-8 text-xs bg-background border-border" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Results */}
      {!hasAnyHolding && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {sk ? 'Zadaj svoje držby vyššie ↑' : 'Enter your holdings above ↑'}
        </div>
      )}

      {hasAnyHolding && results && results.map(token => (
        <Card key={token.symbol} className="border-border bg-card overflow-hidden">
          <div className="h-1" style={{ backgroundColor: token.color }} />
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: token.color }} />
                {token.symbol}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{formatUsd(token.totalValueUsd)}</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {token.actions.map((action, i) => {
              const Icon = actionIcon(action.type);
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${actionColor(action.type)}`} />
                  <span className={`text-xs leading-relaxed ${action.type === 'skip' ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                    {action.label}
                  </span>
                </div>
              );
            })}

            {/* Expandable detail */}
            <Collapsible>
              <CollapsibleTrigger className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1">
                <ChevronDown className="w-3 h-3" />
                {sk ? 'Cieľová alokácia' : 'Target allocation'}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {STAKING_CONFIG.find(c => c.symbol === token.symbol)?.positions.map((pos, j) => {
                  const liveApy = getLiveApy(pos, apys);
                  return (
                    <div key={j} className="flex items-center justify-between text-[10px] text-muted-foreground py-0.5">
                      <span>{pos.label}</span>
                      <span>{pos.percentage}%{liveApy != null ? ` · ${liveApy.toFixed(1)}% APY` : ''}</span>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
