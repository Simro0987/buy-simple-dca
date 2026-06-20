/**
 * LiveDcaOutRadar — Dynamický výber ziskov (Live Risk Score model)
 *
 * Formula: LiveRiskScore = (FearGreed × 0.4) + (RSI × 0.4) + (PnL% × 0.2)
 * Sell%: smooth curve from 2% at score 30 → 15% at score 85+
 * Guard: PnL > 0 required; Moon-Bag: never sell last 15%; Cooldown: +5% recovery
 *
 * Live updates:
 *  • Prices — usePrices (30 s interval)  → pnlPct changes instantly
 *  • F&G    — useFearGreed (5 min)
 *  • RSI    — Binance daily klines (10 min)
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Target, RefreshCw, ShieldCheck, AlertTriangle,
  ChevronDown, ChevronUp, Lock, RotateCcw, ArrowRight, Zap,
  Copy, Check,
} from 'lucide-react';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
import { TOKENS, formatPrice } from '@/lib/crypto';

type DcaT = 'BTC' | 'ETH' | 'SOL';

// ─── design tokens ────────────────────────────────────────────────────────────
const T = {
  card:    'rgba(17,24,39,0.90)',
  border:  'rgba(255,255,255,0.07)',
  teal:    '#0ea5e9', tealBg:  'rgba(14,165,233,0.11)',
  green:   '#10b981', greenBg: 'rgba(16,185,129,0.11)',
  red:     '#ef4444', redBg:   'rgba(239,68,68,0.11)',
  amber:   '#f59e0b', amberBg: 'rgba(245,158,11,0.11)',
  text:    '#f1f5f9',
  textSub: 'rgba(148,163,184,0.70)',
  textMut: 'rgba(100,116,139,0.55)',
  r:       '10px', rs: '7px',
};

const TC: Record<DcaT, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF' };
const CG_ID: Record<DcaT, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };

const SOURCES: Record<DcaT, string[]> = {
  BTC: ['Hardware Wallet (Native BTC)'],
  ETH: ['Natívne ETH', 'rETH (Rocket Pool)', 'wstETH / weETH (ether.fi – Arbitrum)'],
  SOL: ['Natívne SOL', 'Marinade Native', 'INF (Sanctum)'],
};
const DEFAULT_HOLD: Record<DcaT, number> = { BTC: 0.0323276, ETH: 0.527723, SOL: 0 };

// ─── localStorage helpers ─────────────────────────────────────────────────────
function loadDcaPrices(): Record<DcaT, number> {
  try { const s = JSON.parse(localStorage.getItem('dca-out-avg-prices-v1') || '{}'); return { BTC: 0, ETH: 0, SOL: 0, ...s }; }
  catch { return { BTC: 0, ETH: 0, SOL: 0 }; }
}
function saveDcaPrices(p: Record<DcaT, number>) {
  try { localStorage.setItem('dca-out-avg-prices-v1', JSON.stringify(p)); } catch { /* quota */ }
}
function loadCooldown(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('dca-out-cooldown-v1') || '{}'); } catch { return {}; }
}
function saveCooldown(c: Record<string, number>) {
  try { localStorage.setItem('dca-out-cooldown-v1', JSON.stringify(c)); } catch { /* quota */ }
}
function loadHoldings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}'); } catch { return {}; }
}

// ─── RSI fetch (Binance daily klines) ────────────────────────────────────────
function calcRSI(closes: number[]): number {
  const p = 14;
  if (closes.length < p + 1) return 50;
  const sl = closes.slice(-(p + 1));
  let g = 0, l = 0;
  for (let i = 1; i < sl.length; i++) { const d = sl[i] - sl[i-1]; d > 0 ? g += d : l -= d; }
  const ag = g / p, al = l / p;
  if (al === 0) return 99;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + ag / al))));
}

async function fetchAllRSI(): Promise<Record<DcaT, number>> {
  const fetch1 = async (sym: string): Promise<number> => {
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 10_000);
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=30`, { signal: ctrl.signal });
      if (!r.ok) return 50;
      const d = await r.json() as [number,string,string,string,string,string,...unknown[]][];
      return calcRSI(d.map(k => parseFloat(k[4])));
    } catch { return 50; }
  };
  const [btc, eth, sol] = await Promise.all([fetch1('BTCUSDT'), fetch1('ETHUSDT'), fetch1('SOLUSDT')]);
  return { BTC: btc, ETH: eth, SOL: sol };
}

// ─── Live Risk Score formula ─────────────────────────────────────────────────
function liveRiskScore(fg: number, rsi: number, pnlPct: number): number {
  return (fg * 0.4) + (rsi * 0.4) + (pnlPct * 0.2);
}

/** Smooth sell-% curve: 0% at score ≤30, ramp to 15% at score ≥85 */
function sellPctFromScore(score: number): number {
  if (score <= 30) return 0;
  if (score >= 85) return 15;
  const raw = 2 + ((score - 30) / (85 - 30)) * 13;
  return Math.round(raw * 10) / 10;
}

/** Color for risk score */
function scoreColor(score: number) {
  if (score >= 70) return T.red;
  if (score >= 50) return T.amber;
  return T.green;
}
function scoreBg(score: number) {
  if (score >= 70) return T.redBg;
  if (score >= 50) return T.amberBg;
  return T.greenBg;
}

// ─── Pill helper ──────────────────────────────────────────────────────────────
function Pill({ l, c, bg }: { l: string; c: string; bg: string }) {
  return (
    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 4, color: c, background: bg }}>
      {l}
    </span>
  );
}

// ─── confirm-sell: updates holdings + free cash + cooldown ───────────────────
function confirmSell(sym: DcaT, sellQty: number, currentPrice: number) {
  // A) Reduce holdings in localStorage
  const h   = loadHoldings();
  const key = sym.toLowerCase();
  h[key]    = Math.max(0, (h[key] ?? DEFAULT_HOLD[sym]) - sellQty);
  localStorage.setItem('smart-alloc-holdings', JSON.stringify(h));

  // B) Add sold USD value to Voľný cash (Profit Reservoir)
  const soldUsd  = sellQty * currentPrice;
  const prevCash = parseFloat(localStorage.getItem('free-cash') || '0') || 0;
  localStorage.setItem('free-cash', String(prevCash + soldUsd));

  // C) Activate cascade cooldown for this symbol
  const cd = loadCooldown();
  cd[sym]  = currentPrice;
  saveCooldown(cd);

  // Notify TerminalDashboard to re-read localStorage
  window.dispatchEvent(new Event('portfolio-updated'));
}

// ─── reason generator ────────────────────────────────────────────────────────
function generateReason(fg: number, rsi: number, pnlPct: number, sym: DcaT, score: number): string {
  const fgC  = fg  * 0.4;
  const rsiC = rsi * 0.4;
  const pnlC = pnlPct * 0.2;
  const max  = Math.max(fgC, rsiC, pnlC);

  if (max === fgC && fg >= 70) {
    if (fg > 85) return `Extrémne trhové FOMO. Globálna eufória (F&G: ${fg}) ťahá trh na vrchol. PnL: +${pnlPct.toFixed(1)}%. Ideálny čas na zníženie rizika – história ukazuje reverzie z takýchto úrovní.`;
    return `Vysoká trhová eufória (F&G: ${fg}). Trh je v chamtivej fáze – emocionálne nákupy dominujú. PnL ${sym}: +${pnlPct.toFixed(1)}%. Odporúčam postupne znižovať expozíciu.`;
  }
  if (max === rsiC && rsi > 70) {
    const mktMood = fg < 45 ? 'globálny trh je ešte v neutrálnej / bearish zóne' : 'globálny trh rastie';
    return `Lokálna pumpa ${sym}. RSI(14d): ${rsi} – minca je výrazne prekúpená. ${mktMood} (F&G: ${fg}). PnL: +${pnlPct.toFixed(1)}%. Ideálne na parciálny výber pred korekciou.`;
  }
  if (score < 50) return `Mierny rast portfólia. ${sym} je v stabilnom zisku (+${pnlPct.toFixed(1)}%), F&G: ${fg}, RSI: ${rsi}. Plynulé odkrajovanie do Profit Reservoiru pre budúce Limit nákupy BTC.`;
  return `Kombinovaný signál. F&G: ${fg}, RSI ${sym}: ${rsi}, PnL: +${pnlPct.toFixed(1)}%. Viacero indikátorov súčasne ukazuje na zníženie rizika.`;
}

// ─── Risk score progress bar ─────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const col = scoreColor(score);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: T.textMut, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Live Risk Score
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}>
          {score.toFixed(1)} / 100
        </span>
      </div>

      {/* Gradient bar with animated position dot */}
      <div style={{ position: 'relative', height: 8, borderRadius: 999,
        background: 'linear-gradient(to right, #10b981, #f59e0b 50%, #ef4444)',
        overflow: 'visible' }}>
        {/* Background fill showing actual score */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 999,
          background: 'rgba(0,0,0,0.55)', right: `${100 - pct}%`, transition: 'right 0.8s ease' }} />
        {/* Position indicator dot */}
        <div
          className={score >= 70 ? 'animate-pulse' : ''}
          style={{
            position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
            left: `${pct}%`, transition: 'left 0.8s ease',
            width: 12, height: 12, borderRadius: '50%',
            backgroundColor: col,
            border: '2px solid rgba(255,255,255,0.9)',
            boxShadow: `0 0 6px ${col}`,
            zIndex: 2,
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 7.5, color: T.green }}>0 · Akumulácia</span>
        <span style={{ fontSize: 7.5, color: T.amber }}>50 · Pozor</span>
        <span style={{ fontSize: 7.5, color: T.red }}>85+ · Max výber</span>
      </div>
    </div>
  );
}

// ─── Single token card ────────────────────────────────────────────────────────
function TokenCard({
  sym, currentPrice, rsi, fg, dcaPrice, onDcaChange, onConfirm,
}: {
  sym: DcaT; currentPrice: number; rsi: number; fg: number;
  dcaPrice: number; onDcaChange: (v: number) => void;
  onConfirm: () => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [copied, setCopied] = useState(false);
  const tc = TC[sym];

  const holdings  = loadHoldings();
  const hold      = holdings[sym.toLowerCase()] ?? DEFAULT_HOLD[sym];
  const pnlPct    = dcaPrice > 0 && currentPrice > 0 ? ((currentPrice - dcaPrice) / dcaPrice) * 100 : 0;
  const inProfit  = pnlPct > 0;

  // LiveRiskScore (only meaningful when in profit)
  const score     = inProfit ? liveRiskScore(fg, rsi, pnlPct) : 0;
  const sellPct   = inProfit ? sellPctFromScore(score) : 0;
  const maxSell   = hold * 0.85;
  const sellQtyRaw = hold * (sellPct / 100);
  const sellQty   = Math.min(sellQtyRaw, maxSell);
  const moonOk    = sellQty > 0 && sellQtyRaw <= maxSell;

  const cd        = loadCooldown();
  const cdPrice   = cd[sym] ?? 0;
  const cdActive  = cdPrice > 0 && currentPrice < cdPrice * 1.05;

  const status: 'ACCUMULATE' | 'HOLD' | 'SELL' =
    !inProfit             ? 'ACCUMULATE' :
    sellPct === 0 || cdActive || !moonOk ? 'HOLD' :
    'SELL';

  const sc = status === 'SELL' ? T.red : status === 'HOLD' ? T.teal : T.green;
  const sb = status === 'SELL' ? T.redBg : status === 'HOLD' ? T.tealBg : T.greenBg;

  // Dynamic glow border based on risk level
  const glowClass  = status === 'SELL' && sellPct >= 10 ? 'animate-pulse' : '';
  const glowBorder = status === 'SELL' && sellPct >= 10
    ? 'rgba(239,68,68,0.85)'
    : status === 'SELL' && sellPct >= 5
    ? 'rgba(249,115,22,0.55)'
    : T.border;
  const glowShadow = status === 'SELL' && sellPct >= 10
    ? '0 0 20px rgba(239,68,68,0.40), inset 0 0 20px rgba(239,68,68,0.04)'
    : status === 'SELL' && sellPct >= 5
    ? '0 0 14px rgba(249,115,22,0.25)'
    : 'none';

  return (
    <div
      className={glowClass}
      style={{ background: T.card, border: `1px solid ${glowBorder}`, borderRadius: T.r,
        borderLeft: `2px solid ${tc}`, overflow: 'hidden', boxShadow: glowShadow,
        transition: 'box-shadow 0.5s ease, border-color 0.5s ease' }}>

      {/* ── Always-visible header ── */}
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: tc, background: `${tc}18`,
          border: `1px solid ${tc}30`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.05em', flexShrink: 0 }}>
          {sym}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color: sc, background: sb,
          border: `1px solid ${sc}40`, borderRadius: 5, padding: '3px 8px',
          display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {status === 'SELL' ? <Zap size={9}/> : <ShieldCheck size={9}/>} {status}
        </span>
        <span style={{ flex: 1 }} />

        {/* Live score badge */}
        {inProfit && (
          <span style={{ fontSize: 9, fontWeight: 700, color: scoreColor(score),
            background: scoreBg(score), borderRadius: 5, padding: '2px 6px',
            fontVariantNumeric: 'tabular-nums' }}>
            ⚡ {score.toFixed(0)}
          </span>
        )}

        {/* Current price */}
        {currentPrice > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatPrice(currentPrice)}
          </span>
        )}

        {/* PnL% */}
        {dcaPrice > 0 && currentPrice > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: pnlPct >= 0 ? T.green : T.red }}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </span>
        )}
        {open ? <ChevronUp size={12} style={{ color: T.textMut, flexShrink: 0 }} />
               : <ChevronDown size={12} style={{ color: T.textMut, flexShrink: 0 }} />}
      </button>

      {/* ── Expandable detail ── */}
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: `1px solid ${T.border}` }}>

          {/* Indicators */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 10, flexWrap: 'wrap' as const }}>
            <Pill l={`RSI(14d) ${rsi}`} c={rsi > 75 ? T.red : rsi < 35 ? T.green : T.teal}
              bg={rsi > 75 ? T.redBg : rsi < 35 ? T.greenBg : T.tealBg} />
            <Pill l={`F&G ${fg}`} c={fg > 70 ? T.red : fg < 35 ? T.green : T.amber}
              bg={fg > 70 ? T.redBg : fg < 35 ? T.greenBg : T.amberBg} />
            <Pill l={`${hold.toPrecision(4)} ${sym}`} c={T.textSub} bg="rgba(255,255,255,0.05)" />
          </div>

          {/* DCA price input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 9, color: T.textMut, flexShrink: 0 }}>Priem. DCA cena $</span>
            <input type="number" min="0" step="0.01" value={dcaPrice || ''} placeholder="0.00"
              onChange={e => onDcaChange(parseFloat(e.target.value) || 0)}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
                borderRadius: 6, color: T.text, fontSize: 11, fontWeight: 600, padding: '4px 8px',
                outline: 'none', fontVariantNumeric: 'tabular-nums', maxWidth: 140 }} />
          </div>

          {/* Live Risk Score bar (only when in profit) */}
          {inProfit ? (
            <div style={{ marginBottom: 12 }}>
              <RiskBar score={score} />
              <p style={{ fontSize: 8.5, color: T.textMut, marginTop: 4, lineHeight: 1.4 }}>
                Score = (F&G {fg} × 0.4) + (RSI {rsi} × 0.4) + (PnL {pnlPct.toFixed(1)}% × 0.2) = <strong style={{ color: scoreColor(score) }}>{score.toFixed(1)}</strong>
                {sellPct > 0 ? ` → ${sellPct}% odpredaj` : ' → HOLD'}
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 10, padding: '8px 10px', background: T.greenBg,
              border: `1px solid ${T.green}30`, borderRadius: T.rs }}>
              <p style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>
                {dcaPrice > 0
                  ? `STATUS: ${sym} AKUMULÁCIA — pozícia v strate. Risk Score sa počíta len keď PnL > 0%.`
                  : `STATUS: ${sym} — nastav priemernú DCA cenu pre výpočet Risk Score.`}
              </p>
            </div>
          )}

          {/* Guards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {[
              { ok: inProfit, label: `PnL > 0% Guard: ${pnlPct.toFixed(2)}% ${inProfit ? '✓ Live výpočet aktívny' : '— čakám na kladný PnL'}` },
              { ok: !cdActive, label: cdActive ? `Cooldown: čakám na +5% od $${cdPrice.toLocaleString('en-US',{maximumFractionDigits:0})}` : 'Cooldown: voľný ✓' },
              { ok: moonOk || status !== 'SELL', label: `Moon-Bag 15%: min. ${(hold*0.15).toPrecision(4)} ${sym} zostane navždy` },
            ].map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                {g.ok ? <ShieldCheck size={10} style={{ color: T.green, flexShrink: 0, marginTop: 1 }} />
                      : <AlertTriangle size={10} style={{ color: T.amber, flexShrink: 0, marginTop: 1 }} />}
                <span style={{ fontSize: 9.5, color: g.ok ? T.green : T.amber, lineHeight: 1.4 }}>{g.label}</span>
              </div>
            ))}
          </div>

          {/* HOLD message */}
          {status === 'HOLD' && (
            <div style={{ background: T.tealBg, border: `1px solid ${T.teal}30`, borderRadius: T.rs, padding: '8px 10px' }}>
              <p style={{ fontSize: 10, color: T.teal, fontWeight: 600 }}>
                STATUS: {sym} HOLD — Risk Score {score.toFixed(0)} pod prahom odpredaja (30). Žiadna akcia.
              </p>
            </div>
          )}

          {/* SELL execution block */}
          {status === 'SELL' && (
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: T.rs, padding: '10px 12px', marginTop: 4 }}>
              <p style={{ fontSize: 9, fontWeight: 800, color: T.red, marginBottom: 8,
                letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                ⚡ LIVE RISK SCORE: {score.toFixed(1)} / 100 — ODPORÚČANÝ ODPREDAJ {sellPct}%
              </p>
              {/* 🧠 Reason explanation */}
              <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(239,68,68,0.05)',
                border: '1px solid rgba(239,68,68,0.15)', borderRadius: T.rs }}>
                <p style={{ fontSize: 9.5, color: T.textSub, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 800, color: T.red }}>🧠 DÔVOD: </span>
                  {generateReason(fg, rsi, pnlPct, sym, score)}
                </p>
              </div>
              {[
                { ico: '🔴', lbl: 'LIVE AKCIA', val: `Predaj ${sellQty.toFixed(4)} ${sym}  (${sellPct}% pozície · Risk Score ${score.toFixed(0)})`, isSell: true },
                { ico: '📂', lbl: 'ZDROJ',      val: SOURCES[sym].join(' / '), isSell: false },
                { ico: '🎯', lbl: 'CIEĽ',       val: 'Zameň za crvUSD → Profit Reservoir (Arbitrum)', isSell: false },
                { ico: '⚡', lbl: 'STRATÉGIA',  val: 'Zisk pripravený na budúci Limit Buy BTC', isSell: false },
              ].map(row => (
                <div key={row.lbl} style={{ display: 'flex', alignItems: 'flex-start', gap: 6,
                  marginBottom: 5, fontSize: 10 }}>
                  <span style={{ fontSize: 12, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{row.ico}</span>
                  <span style={{ color: T.textMut, fontWeight: 700, minWidth: 80, flexShrink: 0 }}>{row.lbl}:</span>
                  <span style={{ color: T.text, lineHeight: 1.35, flex: 1 }}>{row.val}</span>
                  {/* Copy button on LIVE AKCIA row */}
                  {row.isSell && (
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(sellQty.toFixed(4));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      style={{ background: 'transparent', border: `1px solid ${copied ? T.green : T.border}`,
                        borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                        color: copied ? T.green : T.textMut, transition: 'all 0.2s ease' }}
                      title="Kopírovať množstvo"
                    >
                      {copied
                        ? <><Check size={9}/><span style={{ fontSize: 8, fontWeight: 700 }}>Skopírované!</span></>
                        : <><Copy size={9}/><span style={{ fontSize: 8 }}>Kopírovať</span></>}
                    </button>
                  )}
                </div>
              ))}

              {/* ── Confirm sell button ── */}
              <button
                className={sellPct >= 10 ? 'animate-pulse' : ''}
                onClick={() => {
                  confirmSell(sym, sellQty, currentPrice);
                  onConfirm();
                  setOpen(false);
                }}
                style={{
                  marginTop: 10, width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: sellPct >= 10 ? 'rgba(239,68,68,0.85)' : 'rgba(234,88,12,0.85)',
                  border: `1px solid ${sellPct >= 10 ? 'rgba(239,68,68,0.6)' : 'rgba(249,115,22,0.6)'}`,
                  borderRadius: 7, padding: '9px 14px',
                  color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                  boxShadow: sellPct >= 10 ? '0 0 12px rgba(239,68,68,0.35)' : '0 0 8px rgba(234,88,12,0.25)',
                  fontFamily: 'monospace',
                }}
              >
                <Lock size={12}/>
                Potvrdiť odpredaj · {sellQty.toFixed(4)} {sym} → Profit Reservoir
              </button>
              <p style={{ fontSize: 8, color: T.textMut, textAlign: 'center' as const, marginTop: 5, lineHeight: 1.4 }}>
                ↑ Odpočíta holdings · Pripočíta ${(sellQty * currentPrice).toFixed(2)} do Voľný cash · Aktivuje cooldown +5%
              </p>
            </div>
          )}

          {cdActive && (
            <button onClick={() => { const c = loadCooldown(); delete c[sym]; saveCooldown(c); }}
              style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: `1px solid ${T.border}`,
                borderRadius: 5, padding: '4px 8px', color: T.textMut, fontSize: 9, cursor: 'pointer' }}>
              <RotateCcw size={9}/> Resetuj cooldown
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export function LiveDcaOutRadar() {
  // Live prices (30s interval) — pnlPct updates automatically
  const { data: prices, isFetching } = usePrices();
  // Fear & Greed (5 min)
  const { data: fg } = useFearGreed();
  // RSI from Binance daily klines (10 min)
  const { data: rsiData, isLoading: rsiLoading, refetch: rsiRefetch } = useQuery({
    queryKey:        ['live-dca-rsi'],
    queryFn:         fetchAllRSI,
    staleTime:       10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2,
  });

  const [dcaPrices, setDcaPricesState] = useState(loadDcaPrices);
  // incrementing this forces TokenCard children to re-read localStorage after confirm
  const [confirmKey, setConfirmKey] = useState(0);
  const updateDcaPrice = useCallback((sym: DcaT, v: number) => {
    setDcaPricesState(prev => { const n = { ...prev, [sym]: v }; saveDcaPrices(n); return n; });
  }, []);

  const fgValue = fg?.value ?? 50;
  const rsi     = rsiData ?? { BTC: 50, ETH: 50, SOL: 50 };

  // Current prices from CoinGecko (fast, live)
  const livePrices: Record<DcaT, number> = {
    BTC: prices?.[CG_ID.BTC]?.usd ?? 0,
    ETH: prices?.[CG_ID.ETH]?.usd ?? 0,
    SOL: prices?.[CG_ID.SOL]?.usd ?? 0,
  };

  const sellSignals = (['BTC', 'ETH', 'SOL'] as DcaT[]).filter(sym => {
    const p     = livePrices[sym];
    const dca   = dcaPrices[sym];
    if (!p || !dca) return false;
    const pnlPct = ((p - dca) / dca) * 100;
    if (pnlPct <= 0) return false;
    const score  = liveRiskScore(fgValue, rsi[sym], pnlPct);
    return sellPctFromScore(score) > 0;
  }).length;

  const isLoading = rsiLoading;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderBottom: `1px solid ${T.border}`, background: 'rgba(14,165,233,0.04)' }}>
        <Target size={13} style={{ color: T.teal, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: T.text, textTransform: 'uppercase',
              letterSpacing: '0.07em', lineHeight: 1 }}>
              DCA-Out Radar · Live Model
            </p>
            <span style={{ fontSize: 8, fontWeight: 700, color: T.teal, background: T.tealBg,
              border: `1px solid ${T.teal}40`, borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>
              {isFetching ? 'SYNC…' : 'LIVE'}
            </span>
          </div>
          <p style={{ fontSize: 8.5, color: T.textMut, marginTop: 2 }}>
            Score = F&G×0.4 + RSI×0.4 + PnL%×0.2 · Výber → crvUSD (Arbitrum)
          </p>
        </div>

        {/* Indicators row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 7.5, color: T.textMut, marginBottom: 1 }}>F&G</p>
            <span style={{ fontSize: 10, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: fgValue > 70 ? T.red : fgValue < 35 ? T.green : T.amber }}>
              {fgValue}
            </span>
          </div>
          {sellSignals > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8.5, fontWeight: 800,
              background: T.redBg, color: T.red, border: `1px solid ${T.red}40`, borderRadius: 5, padding: '3px 7px' }}>
              <Zap size={9}/> {sellSignals} SIGNÁL
            </span>
          )}
          <button onClick={() => void rsiRefetch()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3 }}>
            <RefreshCw size={11} style={{ color: T.textMut }} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ padding: '7px 12px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowRight size={10} style={{ color: T.teal, flexShrink: 0 }} />
        <p style={{ fontSize: 9, color: T.textMut, lineHeight: 1.4 }}>
          Cieľ: <span style={{ color: T.teal, fontWeight: 700 }}>Profit Reservoir</span>
          {' '}— crvUSD · Arbitrum{' → '}
          <span style={{ color: T.amber, fontWeight: 600 }}>budúci Limit Buy BTC</span>
          {' · '}Prices live každých 30s · RSI každých 10min
        </p>
      </div>

      {/* Formula legend */}
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}`,
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {[
          { range: 'Score < 30', action: 'HOLD', c: T.green  },
          { range: 'Score 30–55', action: '2–5% výber', c: T.amber  },
          { range: 'Score 55–85+', action: '5–15% výber', c: T.red   },
        ].map(x => (
          <div key={x.range} style={{ textAlign: 'center' as const }}>
            <p style={{ fontSize: 7.5, color: T.textMut }}>{x.range}</p>
            <p style={{ fontSize: 8, fontWeight: 700, color: x.c }}>{x.action}</p>
          </div>
        ))}
      </div>

      {/* Token cards */}
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading && (
          <div style={{ padding: '14px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={12} className="animate-spin" style={{ color: T.teal }} />
            <span style={{ fontSize: 10, color: T.textMut }}>Načítavam RSI z Binance Daily klines…</span>
          </div>
        )}
        {(['BTC', 'ETH', 'SOL'] as DcaT[]).map(sym => (
          <TokenCard
            key={`${sym}-${confirmKey}`}
            sym={sym}
            currentPrice={livePrices[sym]}
            rsi={rsi[sym]}
            fg={fgValue}
            dcaPrice={dcaPrices[sym] ?? 0}
            onDcaChange={v => updateDcaPrice(sym, v)}
            onConfirm={() => setConfirmKey(k => k + 1)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 12px', borderTop: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 8.5, color: T.textMut }}>Ceny: CoinGecko (30s) · RSI: Binance 1d · F&G: alternative.me</p>
        <p style={{ fontSize: 8.5, color: T.textMut }}>Klikni na token pre detail</p>
      </div>
    </div>
  );
}
