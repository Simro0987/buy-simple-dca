"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BINANCE_WS_URLS, buildTickerStreamUrl } from "@/lib/dca/binance";
import { checkUpcomingUnlocks } from "@/lib/dca/highBetaProtocol";
import { computeTokenIndicators } from "@/lib/dca/indicators";
import type {
  DcaSymbol,
  OhlcvCandle,
  TokenMarketSnapshot,
} from "@/lib/dca/types";
import { DCA_TOKENS } from "@/lib/dca/universe";

interface TickerPayload {
  price: number;
  change24h: number;
  volume24h: number;
}

interface YieldPayload {
  apy: number;
  project: string;
}

export function useDcaMarketData() {
  const [klines, setKlines] = useState<Partial<Record<DcaSymbol, OhlcvCandle[]>>>(
    {},
  );
  const [weeklyKlines, setWeeklyKlines] = useState<
    Partial<Record<DcaSymbol, OhlcvCandle[]>>
  >({});
  const [tickers, setTickers] = useState<Partial<Record<DcaSymbol, TickerPayload>>>(
    {},
  );
  const [yields, setYields] = useState<Partial<Record<DcaSymbol, YieldPayload>>>(
    {},
  );
  const [unlocks, setUnlocks] = useState<Partial<Record<DcaSymbol, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUnlocks() {
      const highBeta = DCA_TOKENS.filter((token) => token.category === "HIGH_BETA");
      const entries = await Promise.all(
        highBeta.map(async (token) => {
          const flagged = await checkUpcomingUnlocks(token.symbol);
          return [token.symbol, flagged] as const;
        }),
      );
      if (!cancelled) {
        setUnlocks(Object.fromEntries(entries) as Partial<Record<DcaSymbol, boolean>>);
      }
    }

    void loadUnlocks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [klinesRes, tickersRes, yieldsRes] = await Promise.all([
          fetch("/api/dca/klines", { cache: "no-store" }),
          fetch("/api/dca/tickers", { cache: "no-store" }),
          fetch("/api/dca/yields", { cache: "no-store" }),
        ]);

        const klinesJson = (await klinesRes.json()) as {
          klines?: Partial<Record<DcaSymbol, OhlcvCandle[]>>;
          weeklyKlines?: Partial<Record<DcaSymbol, OhlcvCandle[]>>;
        };
        const tickersJson = (await tickersRes.json()) as {
          tickers?: Partial<Record<DcaSymbol, TickerPayload>>;
        };
        const yieldsJson = (await yieldsRes.json()) as {
          yields?: Partial<Record<DcaSymbol, YieldPayload>>;
        };

        if (cancelled) return;
        setKlines(klinesJson.klines ?? {});
        setWeeklyKlines(klinesJson.weeklyKlines ?? {});
        setTickers(tickersJson.tickers ?? {});
        setYields(yieldsJson.yields ?? {});
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Dáta sa nepodarilo načítať");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 120_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // HYPE is not on Binance spot in all regions; keep it on REST/CoinGecko.
    const pairs = DCA_TOKENS.filter((token) => token.symbol !== "HYPE").map(
      (token) => token.binance,
    );
    const pairToSymbol = Object.fromEntries(
      DCA_TOKENS.map((token) => [token.binance, token.symbol]),
    ) as Record<string, DcaSymbol>;

    let stopped = false;
    let socket: WebSocket | null = null;
    let urlIndex = 0;

    const connect = (index: number) => {
      if (stopped || index >= BINANCE_WS_URLS.length) {
        setLive(false);
        return;
      }
      const url = buildTickerStreamUrl(pairs, BINANCE_WS_URLS[index]);
      try {
        socket = new WebSocket(url);
        wsRef.current = socket;
      } catch {
        connect(index + 1);
        return;
      }

      socket.onopen = () => {
        if (!stopped) setLive(true);
      };
      socket.onerror = () => {
        if (stopped) return;
        setLive(false);
      };
      socket.onclose = () => {
        if (stopped) return;
        setLive(false);
        if (index === urlIndex) {
          urlIndex += 1;
          connect(urlIndex);
        }
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            data?: { s?: string; c?: string; P?: string; v?: string };
          };
          const pair = message.data?.s;
          const price = Number(message.data?.c);
          if (!pair || !Number.isFinite(price) || price <= 0) return;
          const symbol = pairToSymbol[pair];
          if (!symbol) return;
          setTickers((current) => ({
            ...current,
            [symbol]: {
              price,
              change24h: Number(message.data?.P) || current[symbol]?.change24h || 0,
              volume24h: Number(message.data?.v) || current[symbol]?.volume24h || 0,
            },
          }));
        } catch {
          // ignore malformed ticks
        }
      };
    };

    connect(0);

    return () => {
      stopped = true;
      socket?.close();
      wsRef.current = null;
    };
  }, []);

  const snapshots = useMemo(() => {
    const map: Partial<Record<DcaSymbol, TokenMarketSnapshot>> = {};
    for (const token of DCA_TOKENS) {
      const candles = klines[token.symbol] ?? [];
      const weekly = weeklyKlines[token.symbol] ?? [];
      const ticker = tickers[token.symbol];
      const lastClose = candles[candles.length - 1]?.close ?? 0;
      const lastVolume = candles[candles.length - 1]?.volume ?? 0;
      const price = ticker?.price && ticker.price > 0 ? ticker.price : lastClose;
      const yieldInfo = yields[token.symbol];
      map[token.symbol] = {
        symbol: token.symbol,
        price,
        change24h: ticker?.change24h ?? 0,
        volume24h: ticker?.volume24h && ticker.volume24h > 0 ? ticker.volume24h : lastVolume,
        indicators: computeTokenIndicators(candles, price),
        yieldApy: yieldInfo?.apy ?? null,
        yieldProject: yieldInfo?.project ?? null,
        dailyCandles: candles,
        weeklyCandles: weekly,
        upcomingUnlock: unlocks[token.symbol] ?? false,
      };
    }
    return map;
  }, [klines, weeklyKlines, tickers, yields, unlocks]);

  const pricesReady = Boolean(
    snapshots.BTC && snapshots.BTC.price > 0 && snapshots.ETH && snapshots.ETH.price > 0,
  );

  return {
    snapshots,
    loading,
    error,
    live,
    pricesReady,
  };
}
