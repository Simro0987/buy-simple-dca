// Octagon-driven Execution Split (Market vs Limit Dynamic).
//
// Sliding scale mapping Confluence Octagon Score (0-100) → Market %.
// Anchors from spec:
//   • Score ≈ 10 (Capitulation)  → 30 % Market / 70 % Limit  (catch wicks)
//   • Score ≈ 50 (Neutral)        → 70 % Market / 30 % Limit
//   • Score ≈ 80+ (Uptrend/Greed) → 100 % Market / 0 % Limit (don't miss run)
//
// Formula: piecewise-linear-ish blend. We use `marketPct = clamp(score + 20, 30, 100)`
// which passes cleanly through all three anchor points and is continuous /
// monotonic — žiadne IF/ELSE breakpointy.

export interface OctagonSplit {
  score: number;         // input 0..100
  marketPct: number;     // 30..100
  limitPct: number;      // 0..70
  regime: 'capitulation' | 'value' | 'neutral' | 'trend' | 'euphoria';
  narrative: string;
}

export function octagonExecutionSplit(scoreRaw: number): OctagonSplit {
  const score = Math.max(0, Math.min(100, Number.isFinite(scoreRaw) ? scoreRaw : 50));
  // Continuous linear map: y = score + 20, clamped [30, 100].
  const marketPct = Math.round(Math.max(30, Math.min(100, score + 20)));
  const limitPct = 100 - marketPct;

  let regime: OctagonSplit['regime'];
  if (score < 20) regime = 'capitulation';
  else if (score < 40) regime = 'value';
  else if (score < 65) regime = 'neutral';
  else if (score < 85) regime = 'trend';
  else regime = 'euphoria';

  const narrative =
    regime === 'capitulation'
      ? `Octagon ${score.toFixed(0)} → kapitulácia: LMT ${limitPct}% chytá deep wicks.`
      : regime === 'value'
      ? `Octagon ${score.toFixed(0)} → hodnotová zóna: mierne uprednostni LMT (${limitPct}%).`
      : regime === 'neutral'
      ? `Octagon ${score.toFixed(0)} → neutrál: vyvážený MKT ${marketPct}% / LMT ${limitPct}%.`
      : regime === 'trend'
      ? `Octagon ${score.toFixed(0)} → uptrend: MKT ${marketPct}% aby sme nemeškali za trhom.`
      : `Octagon ${score.toFixed(0)} → eufória: MKT ${marketPct}%, LMT vypnuté.`;

  return { score, marketPct, limitPct, regime, narrative };
}

/**
 * Priemer skóre naprieč tokenmi (BTC/ETH/SOL) — používame ako "overall market score".
 * Ak niektorý axis nie je dostupný, ignoruje sa.
 */
export function averageOctagonScore(perToken: Array<{ axes: Array<{ value: number }> }>): number {
  const vals: number[] = [];
  for (const t of perToken) for (const a of t.axes) {
    if (typeof a.value === 'number' && Number.isFinite(a.value)) vals.push(a.value);
  }
  if (vals.length === 0) return 50;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}
