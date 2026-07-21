"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { searchCoinGecko, type CoinGeckoSearchCoin } from "@/lib/cryptoApi";
import type { AddAssetInput } from "@/hooks/usePortfolio";

interface AddAssetModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (asset: AddAssetInput) => void;
  existingCoingeckoIds: string[];
}

export function AddAssetModal({
  open,
  onClose,
  onAdd,
  existingCoingeckoIds,
}: AddAssetModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoinGeckoSearchCoin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const coins = await searchCoinGecko(query);
        if (!controller.signal.aborted) {
          setResults(coins);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("CoinGecko API je nedostupné. Skús to znova.");
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, query]);

  const handleSelect = (coin: CoinGeckoSearchCoin) => {
    if (existingCoingeckoIds.includes(coin.id)) {
      onClose();
      return;
    }

    onAdd({
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      coingeckoId: coin.id,
      logoUrl: coin.large || coin.thumb,
      category: "yield",
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Zavrieť"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-asset-title"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl sm:rounded-3xl sm:m-4"
          >
            <div className="border-b border-white/5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Portfólio
                  </p>
                  <h2
                    id="add-asset-title"
                    className="mt-1 text-xl font-bold text-white"
                  >
                    Pridať aktívum
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Vyhľadaj token cez CoinGecko.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Hľadaj BTC, Ethereum, Solana..."
                  className="w-full rounded-2xl border border-white/10 bg-black/50 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Načítavam výsledky...
                </div>
              )}

              {!loading && error && (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-6 text-center text-sm text-rose-300">
                  {error}
                </div>
              )}

              {!loading && !error && query.trim().length < 2 && (
                <div className="px-2 py-8 text-center text-sm text-zinc-500">
                  Zadaj aspoň 2 znaky pre vyhľadávanie.
                </div>
              )}

              {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
                <div className="px-2 py-8 text-center text-sm text-zinc-500">
                  Žiadne výsledky pre „{query}“.
                </div>
              )}

              <div className="space-y-1">
                {results.map((coin) => {
                  const alreadyAdded = existingCoingeckoIds.includes(coin.id);

                  return (
                    <button
                      key={coin.id}
                      type="button"
                      onClick={() => handleSelect(coin)}
                      disabled={alreadyAdded}
                      className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-white/10 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                        <Image
                          src={coin.thumb}
                          alt={coin.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">
                          {coin.name}
                        </p>
                        <p className="text-xs uppercase text-zinc-500">
                          {coin.symbol}
                        </p>
                      </div>
                      {alreadyAdded ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Pridané
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                          Pridať
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
