import { useEffect } from 'react';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
import { useMarketEngine } from '@/contexts/MarketContext';
import { subscribeCyborgLedgerSync, useCyborgEngine } from '@/stores/cyborgEngine';

const MARKET_DATA_POLL_MS = 5 * 60 * 1000;

/**
 * App-wide sync layer: keeps masterState aligned with ledger, holdings, prices, market mode, and live API feeds.
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
    useCyborgEngine.getState().setMarketData({
      btcPrice: Number(prices.bitcoin?.usd ?? 0),
      ethPrice: Number(prices.ethereum?.usd ?? 0),
      solPrice: Number(prices.solana?.usd ?? 0),
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
    if (Number.isFinite(fg) && fg > 0) {
      useCyborgEngine.getState().setMarketData({ fearGreedIndex: fg });
    }
  }, [fearGreed?.value]);

  useEffect(() => {
    const refresh = () => {
      const fg = Number(fearGreed?.value ?? useCyborgEngine.getState().marketData.fearGreedIndex ?? 50);
      void useCyborgEngine.getState().refreshMarketData(fg);
    };
    refresh();
    const timer = window.setInterval(refresh, MARKET_DATA_POLL_MS);
    return () => window.clearInterval(timer);
  }, [fearGreed?.value]);

  return null;
}
