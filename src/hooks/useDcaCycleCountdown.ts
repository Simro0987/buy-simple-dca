import { useSyncExternalStore } from 'react';
import { getDcaCycleCountdown, formatCycleCountdown } from '@/lib/dcaCycleTimer';

function subscribe(cb: () => void) {
  window.addEventListener('dca-cycle-updated', cb);
  window.addEventListener('storage', cb);
  const id = setInterval(cb, 60_000);
  return () => {
    window.removeEventListener('dca-cycle-updated', cb);
    window.removeEventListener('storage', cb);
    clearInterval(id);
  };
}

export function useDcaCycleCountdown() {
  const countdown = useSyncExternalStore(subscribe, () => getDcaCycleCountdown(), () => getDcaCycleCountdown());
  return { countdown, label: formatCycleCountdown(countdown) };
}
