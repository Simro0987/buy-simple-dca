import { useEffect, useRef } from 'react';
import { PriceData, TOKENS } from '@/lib/crypto';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';

const ALERTED_KEY = 'price-alert-sent';

function getAlerted(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(ALERTED_KEY) || '{}'); } catch { return {}; }
}

function setAlerted(symbol: string, ts: number) {
  const data = getAlerted();
  data[symbol] = ts;
  localStorage.setItem(ALERTED_KEY, JSON.stringify(data));
}

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per token

export function usePriceAlerts(prices: PriceData | undefined, lang: Lang) {
  const checkedRef = useRef(0);

  useEffect(() => {
    if (!prices) return;
    const now = Date.now();
    if (now - checkedRef.current < 30_000) return; // check max every 30s
    checkedRef.current = now;

    const alerted = getAlerted();
    const sk = lang === 'sk';

    for (const token of TOKENS) {
      const currentPrice = prices[token.coingeckoId]?.usd;
      if (!currentPrice) continue;

      const limitPrice = currentPrice * token.limitDiscount;

      if (currentPrice <= limitPrice) {
        const lastAlert = alerted[token.symbol] || 0;
        if (now - lastAlert < COOLDOWN_MS) continue;

        setAlerted(token.symbol, now);

        const pctBelow = ((limitPrice - currentPrice) / limitPrice * 100).toFixed(1);
        toast.warning(
          sk
            ? `🚨 ${token.symbol} klesol pod limit cenu!`
            : `🚨 ${token.symbol} dropped below limit price!`,
          {
            description: sk
              ? `Aktuálna: $${currentPrice.toLocaleString()} · Limit: $${limitPrice.toLocaleString()} · ${pctBelow}% pod limitom`
              : `Current: $${currentPrice.toLocaleString()} · Limit: $${limitPrice.toLocaleString()} · ${pctBelow}% below`,
            duration: 10000,
          }
        );
      }
    }
  }, [prices, lang]);
}
