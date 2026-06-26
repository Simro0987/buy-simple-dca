import { useEffect } from 'react';
import { usePrices } from '@/hooks/usePrices';
import { useMarketEngine } from '@/contexts/MarketContext';
import { subscribeCyborgLedgerSync, useCyborgEngine } from '@/stores/cyborgEngine';

/**
 * App-wide sync layer: keeps masterState aligned with ledger, holdings, prices, and market mode.
 */
export function CyborgEngineBridge() {
  const { data: prices } = usePrices();
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

  return null;
}
