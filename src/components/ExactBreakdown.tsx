import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, TrendingUp, Landmark, Layers } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG } from '@/lib/wallets';
import { useDefiApys, DefiApyData } from '@/hooks/useDefiApys';
import { HoldingInput } from '@/lib/allocation';

interface Props {
  lang: Lang;
  holdings: HoldingInput;
}

interface BreakdownRow {
  label: string;
  instruction: string;
  amount: number;
  symbol: string;
  type: 'hold' | 'staking' | 'lending';
  apy?: number | null;
}

const COLORS = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', HYPE: '#00D4AA' };

function getApy(protocol: string | undefined, label: string, type: string, apys?: DefiApyData | null): number | null {
  if (!apys) return null;
  if (protocol === 'Rocket Pool') return apys.rocketPool;
  if (label.includes('wstETH') && type !== 'lending') return apys.lido;
  if (protocol === 'Aave V3') return apys.aaveEth;
  if (protocol === 'Jito') return apys.jito;
  if (protocol === 'Kamino') return apys.kaminoSol;
  if (label === 'Native staking') return apys.hypeStaking;
  return null;
}

function typeIcon(type: BreakdownRow['type']) {
  switch (type) {
    case 'hold': return Shield;
    case 'staking': return TrendingUp;
    case 'lending': return Landmark;
  }
}

function typeColor(type: BreakdownRow['type']) {
  switch (type) {
    case 'hold': return 'text-blue-400';
    case 'staking': return 'text-green-400';
    case 'lending': return 'text-yellow-400';
  }
}

function buildBreakdown(symbol: string, total: number, sk: boolean, apys?: DefiApyData | null): BreakdownRow[] {
  const config = STAKING_CONFIG.find(c => c.symbol === symbol);
  if (!config) return [];

  return config.positions.map(pos => {
    const amount = total * (pos.percentage / 100);
    const apy = getApy(pos.protocol, pos.label, pos.type, apys);
    const apySuffix = apy != null ? ` (${apy.toFixed(1)}% APY)` : '';

    let instruction = '';
    if (symbol === 'BTC') {
      instruction = sk ? 'Drž na hardvérovej peňaženke (Trezor)' : 'Hold on hardware wallet (Trezor)';
    } else if (pos.type === 'hold' && pos.label.includes('wstETH')) {
      instruction = sk ? `Mintni ${amount.toFixed(4)} ETH ako wstETH${apySuffix}` : `Mint ${amount.toFixed(4)} ETH as wstETH${apySuffix}`;
    } else if (pos.type === 'hold' && pos.label.includes('JitoSOL')) {
      instruction = sk ? `Drž ${amount.toFixed(2)} SOL ako JitoSOL` : `Hold ${amount.toFixed(2)} SOL as JitoSOL`;
    } else if (pos.type === 'hold') {
      instruction = sk ? `Nechaj ${amount.toFixed(4)} ${symbol} na mainnete` : `Keep ${amount.toFixed(4)} ${symbol} on mainnet`;
    } else if (pos.type === 'staking') {
      instruction = sk
        ? `Stake ${amount.toFixed(4)} ${symbol} cez ${pos.protocol ?? 'native'}${apySuffix}`
        : `Stake ${amount.toFixed(4)} ${symbol} via ${pos.protocol ?? 'native'}${apySuffix}`;
    } else if (pos.type === 'lending') {
      instruction = sk
        ? `Vlož ${amount.toFixed(4)} do ${pos.protocol ?? 'lending'}${apySuffix}`
        : `Deposit ${amount.toFixed(4)} into ${pos.protocol ?? 'lending'}${apySuffix}`;
    }

    return { label: pos.label, instruction, amount, symbol, type: pos.type, apy };
  });
}

function formatAmount(val: number, sym: string): string {
  if (sym === 'BTC') return val.toFixed(8);
  if (val >= 100) return val.toFixed(2);
  return val.toFixed(4);
}

export function ExactBreakdown({ lang, holdings }: Props) {
  const sk = lang === 'sk';
  const { data: apys } = useDefiApys();

  const tokens = [
    { key: 'btc' as const, symbol: 'BTC', name: 'Bitcoin', total: holdings.btc },
    { key: 'eth' as const, symbol: 'ETH', name: 'Ethereum', total: holdings.eth },
    { key: 'sol' as const, symbol: 'SOL', name: 'Solana', total: holdings.sol },
    { key: 'hype' as const, symbol: 'HYPE', name: 'Hyperliquid', total: holdings.hype },
  ].filter(t => t.total > 0);

  if (tokens.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        {sk ? 'Zadaj svoje držby vyššie ↑' : 'Enter your holdings above ↑'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tokens.map(token => {
        const rows = buildBreakdown(token.symbol, token.total, sk, apys);
        const color = COLORS[token.symbol as keyof typeof COLORS];

        return (
          <Card key={token.symbol} className="border-border bg-card overflow-hidden">
            <div className="h-1" style={{ backgroundColor: color }} />
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {sk ? `Rozdelenie ${token.symbol}` : `${token.symbol} Breakdown`}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {formatAmount(token.total, token.symbol)} {token.symbol}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {rows.map((row, i) => {
                const Icon = typeIcon(row.type);
                return (
                  <div key={i} className="flex items-start gap-2 bg-secondary/30 rounded-lg px-3 py-2">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${typeColor(row.type)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{row.label}</span>
                        <span className="text-xs font-bold text-foreground">
                          {formatAmount(row.amount, token.symbol)} {token.symbol}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{row.instruction}</p>
                    </div>
                  </div>
                );
              })}

              {/* Visual bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden bg-secondary mt-1">
                {rows.map((row, i) => {
                  const pct = (row.amount / token.total) * 100;
                  const barColors = { hold: 'bg-blue-400/60', staking: 'bg-green-400/80', lending: 'bg-yellow-400/70' };
                  return (
                    <div key={i} className={barColors[row.type]} style={{ width: `${pct}%` }} />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
