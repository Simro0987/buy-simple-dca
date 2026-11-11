import { useState } from 'react';
import { ShieldAlert, Play } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useEmergencyPause } from '@/lib/emergencyPause';

export function EmergencyPauseButton() {
  const [paused, setPaused] = useEmergencyPause();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    if (paused) {
      // Resume
      if (!confirm('Obnoviť automatickú exekúciu? Engine sa rozbehne.')) return;
      setPaused(false);
      toast.success('Engine OBNOVENÝ — execution povolená');
      return;
    }
    // Pause
    if (!confirm('EMERGENCY PAUSE: okamžite zastaviť všetky Market exekúcie a zrušiť pending Limit objednávky?')) return;
    setBusy(true);
    setPaused(true);
    try {
      const { error } = await supabase
        .from('dca_executions')
        .update({ status: 'CANCELLED' })
        .eq('status', 'PENDING');
      if (error) throw error;
      toast.error('SYSTEM HALTED — Manual Override aktívny');
    } catch (e) {
      toast.warning('Pauza aktívna · pending limity sa nepodarilo zrušiť: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      aria-label={paused ? 'Obnoviť engine' : 'Emergency Pause'}
      title={paused ? 'SYSTEM HALTED — kliknite pre obnovenie' : 'EMERGENCY PAUSE — zastaví všetky exekúcie'}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all active:scale-95 disabled:opacity-50 ${
        paused
          ? 'bg-rose-500 text-white animate-pulse ring-2 ring-rose-400'
          : 'bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25'
      }`}
    >
      {paused ? <Play className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
      {paused ? 'HALTED' : 'PAUSE'}
    </button>
  );
}
