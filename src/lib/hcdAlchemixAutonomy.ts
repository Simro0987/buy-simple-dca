import type { HcdIndicators } from '@/lib/hcdArchitecture';
import { EXIT_ALCHEMIX_APY_FLOOR } from '@/lib/hcdExitStrategy';

const AUTONOMY_KEY = 'hcd-alchemix-autonomous-v1';
export const HCD_ALCHEMIX_AUTONOMY_EVENT = 'hcd-alchemix-autonomous-changed';

export interface AlchemixRedistribution {
  freedEthQty: number;
  coreEthQty: number;
  tacticalEthQty: number;
  corePct: number;
  tacticalPct: number;
  lockedAt: number;
}

export interface AlchemixAutonomyState {
  locked: boolean;
  redistribution: AlchemixRedistribution | null;
}

export function isAlchemixApyBelowFloor(apyPct: number): boolean {
  return Number.isFinite(apyPct) && apyPct < EXIT_ALCHEMIX_APY_FLOOR;
}

/** Split freed Alchemix ETH between Core (L2) and Tactical (L3) based on HCD risk. */
export function computeAlchemixRedistribution(
  freedEthQty: number,
  indicators: HcdIndicators,
): AlchemixRedistribution {
  let corePct = 55;
  let tacticalPct = 45;

  if (indicators.volatilityRegime === 'high' || indicators.borrowWarning) {
    corePct = 75;
    tacticalPct = 25;
  } else if (indicators.volatilityRegime === 'low' && !indicators.borrowWarning) {
    corePct = 40;
    tacticalPct = 60;
  }

  const coreEthQty = freedEthQty * (corePct / 100);
  const tacticalEthQty = freedEthQty * (tacticalPct / 100);

  return {
    freedEthQty,
    coreEthQty,
    tacticalEthQty,
    corePct,
    tacticalPct,
    lockedAt: Date.now(),
  };
}

export function loadAlchemixAutonomyState(): AlchemixAutonomyState {
  try {
    const raw = localStorage.getItem(AUTONOMY_KEY);
    if (!raw) return { locked: false, redistribution: null };
    const parsed = JSON.parse(raw) as AlchemixAutonomyState;
    return {
      locked: !!parsed.locked,
      redistribution: parsed.redistribution ?? null,
    };
  } catch {
    return { locked: false, redistribution: null };
  }
}

export function saveAlchemixAutonomyState(state: AlchemixAutonomyState): void {
  try {
    localStorage.setItem(AUTONOMY_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(HCD_ALCHEMIX_AUTONOMY_EVENT));
  } catch { /* ignore */ }
}

export function lockAlchemixAutonomous(redistribution: AlchemixRedistribution): void {
  saveAlchemixAutonomyState({ locked: true, redistribution });
}

export function unlockAlchemixAutonomous(): void {
  saveAlchemixAutonomyState({ locked: false, redistribution: null });
}
