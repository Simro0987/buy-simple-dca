/**
 * Zobrazuje cenové cieľe (TP1/TP2/TP3) vypočítané z priemernej nákupnej ceny (WACB).
 * Iba vizuálny indikátor — nemení žiadnu logiku výpočtov.
 */
const fmtPrice = (n: number) => {
  const d = n >= 1000 ? 2 : n >= 1 ? 2 : 4;
  return `$${n.toFixed(d).replace('.', ',')}`;
};

export function TpTargetsLine({ wacb, className = '' }: { wacb: number; className?: string }) {
  if (!wacb || wacb <= 0) return null;
  return (
    <p className={`text-[10px] font-mono text-white/30 tabular-nums transition-all duration-300 ease-in-out ${className}`}>
      Ciele: TP1 {fmtPrice(wacb * 1.15)} • TP2 {fmtPrice(wacb * 1.3)} • TP3 {fmtPrice(wacb * 1.5)}
    </p>
  );
}
