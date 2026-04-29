import { useState } from 'react';
import { Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { toast } from 'sonner';

export function DynamicExecutionToggleCard() {
  const { data: settings } = useAppSettings();
  const update = useUpdateAppSettings();
  const [open, setOpen] = useState(false);
  const enabled = settings?.dynamic_execution_enabled ?? true;

  const toggle = async () => {
    if (!settings?.id) return;
    try {
      await update.mutateAsync({ id: settings.id, dynamic_execution_enabled: !enabled });
      toast.success(`Dynamic Engine ${!enabled ? 'zapnutý' : 'vypnutý'}`);
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium text-foreground text-sm">Dynamic Execution Engine</p>
            <p className="text-[11px] text-muted-foreground">
              {enabled ? 'Per-coin Market/Limit split podľa volatility a momenta' : 'Fixný 60% Market / 40% Limit (-4%)'}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={update.isPending}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground transition-transform ${enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground"
      >
        <span>Referenčné tabuľky</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="space-y-3 text-[10px]">
          <div>
            <p className="font-semibold text-foreground mb-1">Score → Base Split</p>
            <table className="w-full">
              <thead className="text-muted-foreground">
                <tr><th className="text-left font-normal">Score</th><th className="text-right font-normal">Market%</th><th className="text-right font-normal">Limit%</th><th className="text-right font-normal">Dist</th></tr>
              </thead>
              <tbody className="tabular-nums text-foreground/90">
                <tr><td>0–25</td><td className="text-right">80</td><td className="text-right">20</td><td className="text-right">-2%</td></tr>
                <tr><td>26–45</td><td className="text-right">70</td><td className="text-right">30</td><td className="text-right">-3%</td></tr>
                <tr><td>46–60</td><td className="text-right">60</td><td className="text-right">40</td><td className="text-right">-4%</td></tr>
                <tr><td>61–75</td><td className="text-right">50</td><td className="text-right">50</td><td className="text-right">-5%</td></tr>
                <tr><td>76–100</td><td className="text-right">35</td><td className="text-right">65</td><td className="text-right">-6%</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="font-semibold text-foreground mb-1">Volatility → Distance ×</p>
            <table className="w-full">
              <tbody className="tabular-nums text-foreground/90">
                <tr><td>&lt; 1.5%</td><td className="text-right">×0.75 (tesnejšie)</td></tr>
                <tr><td>1.5–2.5%</td><td className="text-right">×1.00</td></tr>
                <tr><td>2.5–4.0%</td><td className="text-right">×1.25 (širšie)</td></tr>
                <tr><td>&gt; 4.0%</td><td className="text-right">×1.50 (oveľa širšie)</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="font-semibold text-foreground mb-1">Momentum → Market% +</p>
            <table className="w-full">
              <tbody className="tabular-nums text-foreground/90">
                <tr><td>&gt; +15%</td><td className="text-right">+10 (FOMO)</td></tr>
                <tr><td>+5 až +15%</td><td className="text-right">+5</td></tr>
                <tr><td>-5 až +5%</td><td className="text-right">0 (sideways)</td></tr>
                <tr><td>-15 až -5%</td><td className="text-right">+5 (buy dip)</td></tr>
                <tr><td>&lt; -15%</td><td className="text-right">+10 (deep dip)</td></tr>
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground leading-snug">
            Final Market% = Base + Momentum (clamp 25–90). Distance = Base × Vol-multiplier (clamp -1.5 až -10%).
          </p>
        </div>
      )}
    </div>
  );
}
