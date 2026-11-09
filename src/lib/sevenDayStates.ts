/**
 * Reads the persisted 7-day execution flags (localStorage) for all portfolio
 * tokens so they can be mirrored into the Telegram Daily Risk Report.
 */

export type ExecutionLegKind = 'market' | 'limit';

export interface ActiveExecutionState {
  token: string;
  leg: ExecutionLegKind;
  /** Epoch ms when the flag expires. */
  activeUntil: number;
  /** Whole days remaining (min 1 while active). */
  daysLeft: number;
}

/**
 * localStorage keys used by `useSevenDayActivation` across all cards.
 * Keys differ per card historically, so they are listed explicitly.
 */
const KEYS: Array<{ token: string; leg: ExecutionLegKind; key: string }> = [
  { token: 'BTC', leg: 'market', key: 'btc_dca_mkt_active_until' },
  { token: 'BTC', leg: 'limit', key: 'btc_dca_lmt_active_until' },
  { token: 'ETH', leg: 'market', key: 'eth_dca_mkt_active_until' },
  { token: 'ETH', leg: 'limit', key: 'eth_dca_lmt_active_until' },
  { token: 'SOL', leg: 'market', key: 'sol_isMarketActive' },
  { token: 'SOL', leg: 'limit', key: 'sol_isLimitActive' },
  { token: 'HYPE', leg: 'market', key: 'hype_isMarketActive' },
  { token: 'HYPE', leg: 'limit', key: 'hype_isLimitActive' },
  ...(['LINK', 'AAVE'] as const).flatMap((sym) => ([
    { token: sym, leg: 'market' as ExecutionLegKind, key: `${sym.toLowerCase()}_isMarketActive` },
    { token: sym, leg: 'limit' as ExecutionLegKind, key: `${sym.toLowerCase()}_isLimitActive` },
  ])),
];

/** Drops stale flags of tokens that are no longer part of the portfolio. */
const RETIRED_KEYS = [
  'jup_isMarketActive', 'jup_isLimitActive',
  'gmx_isMarketActive', 'gmx_isLimitActive',
  'morpho_isMarketActive', 'morpho_isLimitActive',
  'pendle_isMarketActive', 'pendle_isLimitActive',
  'jup-defi-brain-confirmed-v1',
  'gmx-defi-brain-confirmed-v1',
  'morpho-defi-brain-confirmed-v1',
  'pendle-defi-brain-confirmed-v1',
];

try {
  for (const k of RETIRED_KEYS) localStorage.removeItem(k);
} catch {
  /* storage unavailable */
}



/** Collects all currently active 7D execution flags. */
export function collectActiveExecutions(now = Date.now()): ActiveExecutionState[] {
  const out: ActiveExecutionState[] = [];
  for (const entry of KEYS) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(entry.key);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= now) continue;
    out.push({
      token: entry.token,
      leg: entry.leg,
      activeUntil: ts,
      daysLeft: Math.max(1, Math.ceil((ts - now) / 86_400_000)),
    });
  }
  return out.sort((a, b) => a.activeUntil - b.activeUntil);
}
