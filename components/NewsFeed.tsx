"use client";

import { motion } from "framer-motion";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { NewsArticleRow } from "@/components/NewsArticleRow";
import { NewsHeroCard } from "@/components/NewsHeroCard";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { useNewsFeed } from "@/hooks/useNewsFeed";
import { listContainerVariants } from "@/lib/motion";

export function NewsFeed() {
  const {
    heroArticle,
    listArticles,
    heroImageUrl,
    loading,
    error,
    lastUpdated,
    refresh,
    articles,
  } = useNewsFeed();

  const flashCount = articles.filter((a) => a.isFlash).length;

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
            Novinky
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Multi-source feed · preložené do slovenčiny
          </p>
          {lastUpdated && !loading && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Aktualizované{" "}
              {lastUpdated.toLocaleTimeString("sk-SK", {
                hour: "2-digit",
                minute: "2-digit",
              })}
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

      {error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <NewsHeroCard
        article={heroArticle}
        imageUrl={heroImageUrl ?? heroArticle?.imageUrl}
        loading={loading}
      />

      <div className="space-y-2">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Najnovšie správy
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
              <NewsArticleRow key={article.id} article={article} />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
