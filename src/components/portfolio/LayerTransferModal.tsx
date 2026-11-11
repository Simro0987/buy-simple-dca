/** Presná manuálna úprava vnorených zostatkov aktíva. */
import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  clearAssetLayerOverride,
  setAssetLayerOverride,
  validateAssetLayerOverride,
} from '@/stores/assetLayerOverrideStore';

const sk = (n: number, d = 6) => n.toFixed(d).replace('.', ',');

type Field = 'liquid' | 'staked' | 'collateral' | 'borrowUsd';
const FIELDS: Array<{ key: Field; label: string; dot: string; unit: (symbol: string) => string }> = [
  { key: 'liquid', label: 'Voľné', dot: 'bg-gain', unit: symbol => symbol },
  { key: 'staked', label: 'Delegované', dot: 'bg-accent', unit: symbol => symbol },
  { key: 'collateral', label: 'Zábezpeka', dot: 'bg-sky-400', unit: symbol => symbol },
  { key: 'borrowUsd', label: 'Dlh / Margin', dot: 'bg-loss', unit: () => 'USDC' },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  symbol: string;
  price: number;
  available: { liquid: number; staked: number; collateral: number; borrowUsd: number };
  manualOverride: boolean;
  apy?: number;
}

export function LayerTransferModal({ open, onOpenChange, symbol, price, available, manualOverride, apy }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({ liquid: '', staked: '', collateral: '', borrowUsd: '' });

  useEffect(() => {
    if (!open) return;
    setValues({
      liquid: String(available.liquid),
      staked: String(available.staked),
      collateral: String(available.collateral),
      borrowUsd: String(available.borrowUsd),
    });
  }, [open, available.liquid, available.staked, available.collateral, available.borrowUsd]);

  const parsed = useMemo(() => ({
    liquid: Number(values.liquid.replace(',', '.')),
    staked: Number(values.staked.replace(',', '.')),
    collateral: Number(values.collateral.replace(',', '.')),
    borrowUsd: Number(values.borrowUsd.replace(',', '.')),
  }), [values]);
  const validation = validateAssetLayerOverride(parsed);
  const total = Math.max(0, parsed.liquid + parsed.staked + parsed.collateral - (price > 0 ? parsed.borrowUsd / price : 0));

  const submit = () => {
    if (!validation.success || !setAssetLayerOverride(symbol, validation.data)) {
      toast({ title: 'Neplatné hodnoty', description: 'Zadajte nezáporné čísla v povolenom rozsahu.', variant: 'destructive' });
      return;
    }
    toast({
      title: 'Zostatky uložené',
      description: `Celkom ${sk(total)} ${symbol.toUpperCase()}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-sm border-border bg-popover/95 p-4 backdrop-blur-xl sm:p-5">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Upraviť zostatky — {symbol.toUpperCase()}</DialogTitle>
          <DialogDescription className="font-mono text-[11px] text-muted-foreground">
            Zadajte presné aktuálne hodnoty. Manuálny údaj má prednosť pred automatickou synchronizáciou.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {FIELDS.map(field => (
            <label key={field.key} className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${field.dot}`} />{field.label}</span>
                <span>{field.unit(symbol.toUpperCase())}</span>
              </span>
              <Input
                type="text"
                inputMode="decimal"
                maxLength={24}
                value={values[field.key]}
                onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
                placeholder="0,000000"
                aria-label={`${field.label} ${field.unit(symbol.toUpperCase())}`}
                className="border-border bg-secondary/60 font-mono tabular-nums"
              />
            </label>
          ))}

          <div className="flex items-center justify-between border-y border-border py-2 font-mono text-xs">
            <span className="text-muted-foreground">Nový celkový zostatok</span>
            <span className="tabular-nums text-foreground">{Number.isFinite(total) ? sk(total) : '—'} {symbol.toUpperCase()}</span>
          </div>
          {apy != null && apy > 0 && <p className="font-mono text-[10px] text-gain">Aktívne APY delegovania: {sk(apy, 2)} %</p>}

          <div className="flex gap-2">
            {manualOverride && (
              <Button type="button" variant="outline" size="sm" className="font-mono text-xs" onClick={() => {
                clearAssetLayerOverride(symbol);
                onOpenChange(false);
                toast({ title: 'Automatické hodnoty obnovené' });
              }}>
                <RotateCcw className="h-3.5 w-3.5" /> Obnoviť
              </Button>
            )}
            <Button onClick={submit} disabled={!validation.success} size="sm" className="flex-1 font-mono text-xs">
              <Save className="h-3.5 w-3.5" /> Uložiť hodnoty
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
