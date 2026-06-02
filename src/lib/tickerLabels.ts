// Master Top tickering policy: UI ukazuje LEN natívne tickery (BTC, ETH, SOL).
// Interný routing (Base L2: WETH/cbBTC, Solana: wSOL) ostáva nedotknutý,
// použiteľný iba pre swap/staking routing service.
//
// MANUAL ONLY — never call from effect (no side-effects, pure function).
export function nativeTicker(s: string | null | undefined): string {
  if (!s) return '';
  const up = s.trim().toUpperCase();
  if (up === 'WETH' || up === 'WSTETH' || up === 'WEETH' || up === 'STETH') return 'ETH';
  if (up === 'CBBTC' || up === 'WBTC' || up === 'LBTC') return 'BTC';
  if (up === 'WSOL' || up === 'JITOSOL' || up === 'MSOL' || up === 'BSOL' || up === 'JUPSOL') return 'SOL';
  return s;
}
