import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Zap, Pencil, Check, Clock, AlertTriangle, X, ShoppingCart, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { formatLimitPrice, formatUsd, type PriceData } from '@/lib/crypto';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { useLimitFillRates } from '@/hooks/useLimitFillRates';
import {
  calcUnifiedExecution,
  fixedExecution,
  type CoinKey,
} from '@/lib/dynamicExecution';

interface Props {
  score: number;
  prices: PriceData | undefined;
  investableUsd: number;
}

type Mode = 'limit1' | 'dynamic';
type Status = 'idle' | 'pending';

interface RowState {
  /** Aktuálna používateľská cena (môže byť editovaná) */
  price: number;
  /** Pôvodný oracle benchmark — pre 2 % deviation check */
  oracle: number;
  status: Status;
  /** Ktorý typ targetu je aktivovaný */
  activeMode?: Mode;
}

const COIN_PRICE_KEY: Record<CoinKey, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

const TARGET_WEIGHTS: Record<CoinKey, number> = { btc: 0.64, eth: 0.25, sol: 0.11 };

const STORAGE_KEY = 'manual-target-execution-v1';

interface SavedRow {
  price?: number;
  oracle?: number;
  status?: Status;
  activeMode?: Mode;
}

function loadSaved(): Record<CoinKey, SavedRow> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { btc: {}, eth: {}, sol: {} };
    const parsed = JSON.parse(raw);
    return { btc: parsed.btc ?? {}, eth: parsed.eth ?? {}, sol: parsed.sol ?? {} };
  } catch {
    return { btc: {}, eth: {}, sol: {} };
  }
}

function saveAll(rows: Record<CoinKey, Record<Mode, RowState>>): void {
  try {
    // Uložíme len aktívne / pendingy + ich editovanú cenu, aby sa stav prežil reload.
    const out: Record<string, SavedRow> = {};
    for (const c of ['btc', 'eth', 'sol'] as CoinKey[]) {
      const r = rows[c];
      const active = r.limit1.status === 'pending' ? r.limit1
        : r.dynamic.status === 'pending' ? r.dynamic
        : undefined;
      if (active) {
        out[c] = {
          price: active.price,
          oracle: active.oracle,
          status: active.status,
          activeMode: active.activeMode,
        };
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch { /* noop */ }
}

export function ManualTargetExecutionCard({ score, prices, investableUsd }: Props) {
  const { data: metrics } = usePerCoinMetrics();
  const { data: fillRates } = useLimitFillRates();

  const coins: CoinKey[] = ['btc', 'eth', 'sol'];

  // Per-coin dynamický limit distance (z primárneho oracle enginu)
  const dynamicByCoin = useMemo(() => {
    if (!metrics) return { btc: fixedExecution('btc'), eth: fixedExecution('eth'), sol: fixedExecution('sol') };
    return calcUnifiedExecution(score, metrics, fillRates ?? { eth: 0.5, sol: 0.5 }).executions;
  }, [metrics, score, fillRates]);

  // Lokálny stav pre každú asset/mode dvojicu
  const [rows, setRows] = useState<Record<CoinKey, Record<Mode, RowState>>>(() => {
    const saved = loadSaved();
    const init = (c: CoinKey): Record<Mode, RowState> => ({
      limit1: { price: 0, oracle: 0, status: 'idle' },
      dynamic: { price: 0, oracle: 0, status: 'idle' },
    });
    const out: Record<CoinKey, Record<Mode, RowState>> = {
      btc: init('btc'), eth: init('eth'), sol: init('sol'),
    };
    for (const c of coins) {
      const s = saved[c];
      if (s?.activeMode && s.status === 'pending' && typeof s.price === 'number') {
        out[c][s.activeMode] = {
          price: s.price,
          oracle: s.oracle ?? s.price,
          status: 'pending',
          activeMode: s.activeMode,
        };
      }
    }
    return out;
  });

  // Pre-fill cien z oracle pri zmene cien (len ak nie je pending a používateľ needitoval)
  useEffect(() => {
    if (!prices) return;
    setRows(prev => {
      const next = { ...prev };
      let changed = false;
      for (const c of coins) {
        const spot = prices[COIN_PRICE_KEY[c]]?.usd ?? 0;
        if (spot <= 0) continue;
        const dynPct = dynamicByCoin[c]?.limitDistancePct ?? -4;
        const l1Target = spot * 0.99;            // Limit -1 %
        const dynTarget = spot * (1 + dynPct / 100);

        // limit1
        if (next[c].limit1.status === 'idle') {
          const r = next[c].limit1;
          if (Math.abs(r.oracle - l1Target) > 0.0001 || r.price <= 0) {
            next[c] = { ...next[c], limit1: { ...r, price: l1Target, oracle: l1Target } };
            changed = true;
          }
        }
        // dynamic
        if (next[c].dynamic.status === 'idle') {
          const r = next[c].dynamic;
          if (Math.abs(r.oracle - dynTarget) > 0.0001 || r.price <= 0) {
            next[c] = { ...next[c], dynamic: { ...r, price: dynTarget, oracle: dynTarget } };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [prices, dynamicByCoin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { saveAll(rows); }, [rows]);

  // Day 7 modal
  const [day7Coin, setDay7Coin] = useState<CoinKey | null>(null);

  const activate = (c: CoinKey, mode: Mode) => {
    setRows(prev => {
      const next = { ...prev };
      const other: Mode = mode === 'limit1' ? 'dynamic' : 'limit1';
      next[c] = {
        ...next[c],
        [mode]: { ...next[c][mode], status: 'pending', activeMode: mode },
        [other]: { ...next[c][other], status: 'idle', activeMode: undefined },
      };
      return next;
    });
    toast.success(`${c.toUpperCase()} ${mode === 'limit1' ? 'Limit -1 %' : 'Dynamic Limit'} aktivovaný · Čakajúca`);
  };

  const cancel = (c: CoinKey, mode: Mode) => {
    setRows(prev => ({
      ...prev,
      [c]: {
        ...prev[c],
        [mode]: { ...prev[c][mode], status: 'idle', activeMode: undefined },
      },
    }));
    toast.success(`${c.toUpperCase()} ${mode === 'limit1' ? 'Limit -1 %' : 'Dynamic Limit'} zrušený`);
  };

  const editPrice = (c: CoinKey, mode: Mode) => {
    const current = rows[c][mode].price;
    const input = window.prompt(
      `Upraviť cieľovú cenu pre ${c.toUpperCase()} (${mode === 'limit1' ? 'Limit -1 %' : 'Dynamic Limit'})`,
      current.toFixed(c === 'btc' ? 0 : 2),
    );
    if (input === null) return;
    const v = Number(input);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error('Neplatná cena');
      return;
    }
    setRows(prev => ({
      ...prev,
      [c]: { ...prev[c], [mode]: { ...prev[c][mode], price: v } },
    }));
  };

  const day7Run = (c: CoinKey, kind: 'cancel' | 'market') => {
    const symU = c.toUpperCase();
    if (kind === 'cancel') {
      setRows(prev => ({
        ...prev,
        [c]: {
          limit1: { ...prev[c].limit1, status: 'idle', activeMode: undefined },
          dynamic: { ...prev[c].dynamic, status: 'idle', activeMode: undefined },
        },
      }));
      toast.success(`${symU} starý čakajúci limit zrušený`);
    } else {
      const coinUsd = investableUsd * TARGET_WEIGHTS[c];
      const spot = prices?.[COIN_PRICE_KEY[c]]?.usd ?? 0;
      const qty = spot > 0 ? coinUsd / spot : 0;
      toast.success(
        `${symU} New Market nákup ${formatUsd(coinUsd)} ≈ ${qty.toFixed(c === 'btc' ? 6 : 4)} ${symU}`,
      );
    }
    setDay7Coin(null);
  };

  return (
    <>
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Manuálne ciele exekúcie</h3>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/15 text-primary">
            ORACLE
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Pre-fill: <span className="text-foreground font-semibold">Limit -1 %</span> a{' '}
          <span className="text-foreground font-semibold">Dynamic Limit</span> z primárneho oracle enginu.
          Aktivuj jeden z targetov, alebo manuálne uprav cenu (varovanie pri odchýlke &gt; 2 % od oracle).
        </p>

        {coins.map(c => {
          const symU = c.toUpperCase();
          const spot = prices?.[COIN_PRICE_KEY[c]]?.usd ?? 0;
          const dynPct = dynamicByCoin[c]?.limitDistancePct ?? -4;
          const coinUsd = investableUsd * TARGET_WEIGHTS[c];

          return (
            <div key={c} className="bg-secondary/40 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-foreground">{symU}</span>
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    spot {spot > 0 ? formatLimitPrice(spot) : '—'} · alokácia {formatUsd(coinUsd)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDay7Coin(c)}
                  className="text-[10px] font-bold px-2 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 active:scale-95"
                  title="Deň 7 — limit nepadol"
                >
                  Nepadlo · Presunúť kapitál
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {([
                  { mode: 'limit1' as Mode, label: 'Limit -1 %', defaultPct: -1 },
                  { mode: 'dynamic' as Mode, label: `Dynamic Limit ${dynPct.toFixed(1)} %`, defaultPct: dynPct },
                ]).map(opt => {
                  const r = rows[c][opt.mode];
                  const isPending = r.status === 'pending';
                  // 2 % deviation kontrola voči oracle
                  const deviationPct = r.oracle > 0 ? ((r.price - r.oracle) / r.oracle) * 100 : 0;
                  const drift = Math.abs(deviationPct) > 2;
                  const cardCls = isPending
                    ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                    : drift
                    ? 'border-orange-500/50 bg-orange-500/10 ring-1 ring-orange-500/30'
                    : 'border-border bg-background/40';
                  return (
                    <div key={opt.mode} className={`rounded p-2 border ${cardCls} space-y-1.5`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-foreground/90">{opt.label}</p>
                        {isPending && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> Aktívna · Čakajúca
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-bold text-foreground tabular-nums">
                          {r.price > 0 ? formatLimitPrice(r.price) : '—'}
                        </p>
                        <button
                          type="button"
                          onClick={() => editPrice(c, opt.mode)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95"
                          aria-label="Upraviť cenu"
                          title="Upraviť cenu"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                      {drift && (
                        <p className="text-[9px] text-orange-300 flex items-center gap-1 leading-tight">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Odchýlka {deviationPct > 0 ? '+' : ''}{deviationPct.toFixed(1)} % od oracle
                        </p>
                      )}
                      {!isPending ? (
                        <button
                          type="button"
                          onClick={() => activate(c, opt.mode)}
                          disabled={r.price <= 0}
                          className="w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-primary text-primary-foreground active:scale-95 disabled:opacity-50"
                        >
                          <Zap className="w-3 h-3" /> Aktivovať {opt.mode === 'limit1' ? 'Limit -1 %' : 'Dynamic Limit'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => cancel(c, opt.mode)}
                          className="w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-rose-500/20 text-rose-300 active:scale-95"
                        >
                          <X className="w-3 h-3" /> Zrušiť
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day 7 — New Market modal */}
      {day7Coin && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={() => setDay7Coin(null)}
        >
          <div
            className="w-full max-w-md glass-card p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deň 7 · New Market</p>
                <h2 className="text-base font-bold text-foreground">
                  Nepadlo — Presunúť kapitál ({day7Coin.toUpperCase()})
                </h2>
              </div>
              <button
                onClick={() => setDay7Coin(null)}
                className="p-1 rounded-md hover:bg-secondary"
                aria-label="Zatvoriť"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Čakajúci limit z minulého týždňa sa nenaplnil. Vyber jednu z dvoch akcií:
              zruš starý limit, alebo okamžite vykonaj market nákup za alokovaný DCA rozpočet.
            </p>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => day7Run(day7Coin, 'cancel')}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25 active:scale-[0.98]"
              >
                <Ban className="w-3.5 h-3.5" /> Zrušiť starý čakajúci limit
              </button>
              <button
                type="button"
                onClick={() => day7Run(day7Coin, 'market')}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-orange-500/20 text-orange-200 border border-orange-500/50 hover:bg-orange-500/30 active:scale-[0.98]"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> Vykonať New Market nákup ({formatUsd(investableUsd * TARGET_WEIGHTS[day7Coin])})
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Akcie sú lokálne — slúžia ako pripomienka. Reálne podanie objednávky vykonávaš na burze / hardvérovej peňaženke.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
