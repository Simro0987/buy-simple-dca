import { useEffect } from 'react';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
import { useMarketEngine } from '@/contexts/MarketContext';
import { subscribeCyborgLedgerSync, useCyborgEngine } from '@/stores/cyborgEngine';

/**
 * App-wide sync layer: keeps masterState aligned with ledger, holdings, prices, and market mode.
 */
export function CyborgEngineBridge() {
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { engine } = useMarketEngine();

  useEffect(() => {
    useCyborgEngine.getState().syncFromSources();
    return subscribeCyborgLedgerSync();
  }, []);

  useEffect(() => {
    if (!prices) return;
    useCyborgEngine.getState().setPrices({
      btc: Number(prices.bitcoin?.usd ?? 0),
      eth: Number(prices.ethereum?.usd ?? 0),
      sol: Number(prices.solana?.usd ?? 0),
    });
  }, [prices]);

  useEffect(() => {
    useCyborgEngine.getState().setMarketMode(engine?.mode ?? 'UNKNOWN');
  }, [engine?.mode]);

  useEffect(() => {
    const fg = Number(fearGreed?.value ?? 0);
    useCyborgEngine.getState().setReasoningContext({
      fearGreed: Number.isFinite(fg) ? fg : 50,
      marketScore: Number.isFinite(fg) && fg > 0 ? fg : useCyborgEngine.getState().reasoningContext.marketScore,
    });
  }, [fearGreed?.value]);

  return null;
}
