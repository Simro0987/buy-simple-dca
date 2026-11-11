// Jupiter Aggregator V6 — SOL → LST swap quote helper.
// Never throws. Uses a synthetic mock fallback so UI always renders.

const JUP_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const TIMEOUT_MS = 3000;

const withTimeout = <T,>(p: Promise<T>) =>
  Promise.race<T>([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT_MS))]);

export const MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  JitoSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  mSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
} as const;

export type LstToken = 'JitoSOL' | 'mSOL';

export interface JupQuote {
  venue: 'Jupiter';
  kind: 'swap';
  tokenOut: LstToken;
  solIn: number;
  tokensOut: number;
  gasUsd: number;
  source: 'live' | 'fallback';
}

export interface NativeQuote {
  venue: 'Native';
  kind: 'native';
  tokenOut: LstToken;
  solIn: number;
  tokensOut: number;
  gasUsd: number;
  source: 'onchain' | 'fallback';
}

export type SolRoute = JupQuote | NativeQuote;

/** Native mint quote (Jito/Marinade delegation). Ratio = LST per SOL. */
export function nativeMintQuote(params: {
  solAmount: number;
  tokenOut: LstToken;
  ratio: number;      // LST per SOL
  gasUsd: number;
  source?: 'onchain' | 'fallback';
}): NativeQuote {
  return {
    venue: 'Native',
    kind: 'native',
    tokenOut: params.tokenOut,
    solIn: params.solAmount,
    tokensOut: params.solAmount * params.ratio,
    gasUsd: params.gasUsd,
    source: params.source ?? 'onchain',
  };
}

/** Jupiter V6 quote — never throws, mocks on failure using given ratio. */
export async function fetchJupiterQuote(params: {
  solAmount: number;
  tokenOut: LstToken;
  fallbackRatio: number;
  gasUsd: number;
  slippageBps?: number;
}): Promise<JupQuote> {
  const { solAmount, tokenOut, fallbackRatio, gasUsd, slippageBps = 50 } = params;
  const lamports = Math.floor(solAmount * 1e9);
  if (lamports <= 0) {
    return {
      venue: 'Jupiter', kind: 'swap', tokenOut,
      solIn: solAmount, tokensOut: 0, gasUsd, source: 'fallback',
    };
  }
  try {
    const url = `${JUP_QUOTE}?inputMint=${MINTS.SOL}&outputMint=${MINTS[tokenOut]}&amount=${lamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
    const res = await withTimeout(fetch(url));
    if (res.ok) {
      const j = await res.json();
      // outAmount is a string in base units; assume 9 decimals for LSTs
      const outRaw = Number(j?.outAmount ?? 0);
      if (outRaw > 0) {
        return {
          venue: 'Jupiter', kind: 'swap', tokenOut,
          solIn: solAmount,
          tokensOut: outRaw / 1e9,
          gasUsd,
          source: 'live',
        };
      }
    }
  } catch { /* fall through */ }
  // Fallback: use ratio slightly worse than native (0.15% slippage)
  return {
    venue: 'Jupiter', kind: 'swap', tokenOut,
    solIn: solAmount,
    tokensOut: solAmount * fallbackRatio * 0.9985,
    gasUsd,
    source: 'fallback',
  };
}

/** Pick best route by tokensOut × implied SOL value − gas. */
export function pickBestSolRoute(routes: SolRoute[], solPriceUsd: number, ratioForToken: (t: LstToken) => number): SolRoute | null {
  if (!routes.length) return null;
  let best: SolRoute | null = null;
  let bestNet = -Infinity;
  for (const r of routes) {
    const impliedSol = r.tokensOut / Math.max(ratioForToken(r.tokenOut), 1e-9);
    const netUsd = impliedSol * solPriceUsd - r.gasUsd;
    if (netUsd > bestNet) { bestNet = netUsd; best = r; }
  }
  return best;
}
