"use client";

import { motion } from "framer-motion";
import { Loader2, RefreshCw, Wallet, Zap } from "lucide-react";
import { NewsArticleRow } from "@/components/NewsArticleRow";
import { NewsHeroCard } from "@/components/NewsHeroCard";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { useNewsFeed } from "@/hooks/useNewsFeed";
import { usePortfolio } from "@/hooks/usePortfolio";
import { listContainerVariants } from "@/lib/motion";

export function NewsFeed() {
  const { allAssets } = usePortfolio();
  const {
    mode,
    setMode,
    heroArticle,
    listArticles,
    heroImageUrl,
    loading,
    error,
    lastUpdated,
    refresh,
    matchedCount,
    portfolioTokens,
  } = useNewsFeed(allAssets);

  const flashCount = listArticles.filter((a) => a.isFlash).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Smart Feed
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Správy podľa tvojich držaných tokenov · slovenčina
          </p>
          {lastUpdated && !loading && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Aktualizované{" "}
              {lastUpdated.toLocaleTimeString("sk-SK", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {mode === "portfolio" && (
                <> · {matchedCount} relevantných správ</>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {flashCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-yellow-400">
              <Zap className="h-3 w-3 fill-yellow-400" />
              {flashCount} flash
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Obnoviť správy"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#111113] text-zinc-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/5 bg-[#111113] p-1">
        <button
          type="button"
          onClick={() => setMode("portfolio")}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
            mode === "portfolio"
              ? "bg-emerald-400/15 text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Wallet className="h-3.5 w-3.5" />
          Moje tokeny
        </button>
        <button
          type="button"
          onClick={() => setMode("all")}
          className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
            mode === "all"
              ? "bg-white/10 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Všetky novinky
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {mode === "portfolio" && portfolioTokens.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
          Pridaj tokeny do portfólia, aby Smart Feed vedel filtrovať relevantné
          správy.
        </div>
      )}

      {mode === "portfolio" &&
        portfolioTokens.length > 0 &&
        matchedCount === 0 &&
        !loading && (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
            Momentálne žiadne správy pre tvoje tokeny (
            {portfolioTokens.map((t) => t.symbol).join(", ")}). Skús „Všetky
            novinky“.
          </div>
        )}

      <NewsHeroCard
        article={heroArticle}
        imageUrl={heroImageUrl ?? heroArticle?.imageUrl}
        loading={loading}
        showTokenBadges={mode === "portfolio"}
      />

      <div className="space-y-2">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          {mode === "portfolio" ? "Relevantné správy" : "Najnovšie správy"}
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <PriceSkeleton key={index} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <motion.div
            variants={listContainerVariants}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            {listArticles.map((article) => (
              <NewsArticleRow
                key={article.id}
                article={article}
                showTokenBadges={mode === "portfolio"}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
