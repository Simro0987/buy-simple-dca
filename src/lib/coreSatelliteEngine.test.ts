import { describe, it, expect } from 'vitest';
import { runCoreSatelliteEngine, type EngineInputs } from './coreSatelliteEngine';

const BASE: EngineInputs = {
  btcWmaDistPct: 0,
  fearGreed: 50,
  cbbcAvg: 90,
  ethCbbc: 88,
  solCbbc: 88, // equal → no CBBC quality bias, isolates RYI effect
  solTvlUsd: 10_000_000_000,
  btcVol14d: 2,
  ethVol14d: 2.8,
  solVol14d: 4.0,
  solVol14dBaseline: 4.0, // ratio 1.0 → no volatility defense
};

describe('runCoreSatelliteEngine — RYI Staking Booster (additive)', () => {
  it('does not shift the satellite split when RYI is equal', () => {
    const r = runCoreSatelliteEngine({ ...BASE, ethRyi: 3, solRyi: 3 });
    expect(r.satelliteRyi.shiftPp).toBe(0);
    expect(r.satelliteRyi.boosterApplied).toBe(false);
  });

  it('shifts satellite allocation toward the higher-RYI token (SOL) proportionally', () => {
    const neutral = runCoreSatelliteEngine({ ...BASE, ethRyi: 3, solRyi: 3 });
    const solBoost = runCoreSatelliteEngine({ ...BASE, ethRyi: 3, solRyi: 5 }); // SOL +2% RYI

    // Core/Satellite macro split is UNCHANGED (only the ETH/SOL internal split moves).
    expect(solBoost.coreWeight).toBe(neutral.coreWeight);
    expect(solBoost.satelliteWeight).toBe(neutral.satelliteWeight);

    // SOL gains, ETH loses, and the shift is the proportional −4 pp (2% × 2).
    expect(solBoost.perToken.sol).toBeGreaterThan(neutral.perToken.sol);
    expect(solBoost.perToken.eth).toBeLessThan(neutral.perToken.eth);
    expect(solBoost.satelliteRyi.shiftPp).toBe(-4);
    expect(solBoost.satelliteRyi.boosterApplied).toBe(true);

    // ETH + SOL still sum to the satellite bucket.
    expect(solBoost.perToken.eth + solBoost.perToken.sol).toBe(solBoost.satelliteWeight);
  });

  it('exposes the RYI values used', () => {
    const r = runCoreSatelliteEngine({ ...BASE, ethRyi: 3, solRyi: 5 });
    expect(r.satelliteRyi.eth).toBe(3);
    expect(r.satelliteRyi.sol).toBe(5);
    expect(r.narrative.some(n => n.includes('RYI Booster'))).toBe(true);
  });
});
