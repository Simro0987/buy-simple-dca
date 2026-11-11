import { Input } from '@/components/ui/input';
import { TokenValue } from './TokenValue';
import { dissolvedValue, type SupplyPosition } from '@/lib/leverageEngine';

export function UnwindSupplyPanel({ position, recorded, nativeSymbol, price, recovered, onChange }: {
  position: SupplyPosition; recorded: boolean; nativeSymbol: string; price?: number; recovered: number;
  onChange: (position: SupplyPosition) => void;
}) {
  const fields = [
    { key: 'stableUsdc' as const, label: 'Výber Stablecoin Supply', symbol: 'USDC', price: 1 },
    { key: 'nativeQty' as const, label: `Native Token Supply · ekvivalent ${nativeSymbol} → USDC`, symbol: nativeSymbol, price },
    { key: 'cashUsdc' as const, label: 'Cash Buffer v Smart Wallet', symbol: 'USDC', price: 1 },
  ];
  const value = dissolvedValue(position, price);
  return <div className="space-y-3 transition-all duration-300 ease-in-out motion-reduce:transition-none">
    {!recorded && <p className="text-xs text-warning">Bez zaznamenanej alokácie · zadaj skutočné zostatky pred potvrdením.</p>}
    {fields.map(field => <div key={field.key} className="border-b border-border py-3 space-y-2">
      <label htmlFor={`unwind-${field.key}`} className="text-xs text-muted-foreground">{field.label}</label>
      {!recorded && <Input id={`unwind-${field.key}`} aria-label={field.label} type="number" min="0" step="any" value={position[field.key]} onChange={e => onChange({ ...position, [field.key]: Math.max(0, Number(e.target.value) || 0) })} />}
      <TokenValue amount={position[field.key]} symbol={field.symbol} price={field.price} size="sm" copy />
    </div>)}
    <p className="text-xs text-muted-foreground">Odhad po rozpustení pri živej cene · bez poplatkov a sklzu</p>
    {value == null ? <p className="text-warning text-xs">Dáta ceny nedostupné</p> : <TokenValue amount={value} symbol="USDC" price={1} copy />}
    <p className="text-xs text-muted-foreground">Potvrdené dostupné USDC na splatenie</p>
    <TokenValue amount={recovered} symbol="USDC" price={1} size="sm" />
  </div>;
}