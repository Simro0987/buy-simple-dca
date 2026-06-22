export const DCA_CYCLE_KEY = 'dca-cycle-activation-ts';
const CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

export function markDcaCycleActivated(): void {
  try {
    localStorage.setItem(DCA_CYCLE_KEY, String(Date.now()));
    window.dispatchEvent(new Event('dca-cycle-updated'));
  } catch { /* quota */ }
}

export interface CycleCountdown {
  days: number;
  hours: number;
  activated: boolean;
  expired: boolean;
}

export function getDcaCycleCountdown(now = Date.now()): CycleCountdown {
  try {
    const ts = Number(localStorage.getItem(DCA_CYCLE_KEY) || 0);
    if (!ts) return { days: 7, hours: 0, activated: false, expired: false };
    const remaining = CYCLE_MS - (now - ts);
    if (remaining <= 0) return { days: 0, hours: 0, activated: true, expired: true };
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return { days, hours, activated: true, expired: false };
  } catch {
    return { days: 7, hours: 0, activated: false, expired: false };
  }
}

export function formatCycleCountdown(cd: CycleCountdown): string {
  if (!cd.activated) return '7 dní : 0 hodín (čaká na aktiváciu)';
  if (cd.expired) return '0 dní : 0 hodín — nový cyklus pripravený';
  return `${cd.days} dní : ${cd.hours} hodín`;
}
