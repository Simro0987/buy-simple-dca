"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useMemo, useState } from "react";
import {
  flashCount,
  newsArticles,
  newsFilters,
  type NewsArticle,
  type NewsCategory,
  type NewsTagVariant,
} from "@/lib/newsData";
import {
  interactiveButton,
  interactiveCard,
  listContainerVariants,
  listItemVariants,
} from "@/lib/motion";

const tagStyles: Record<
  NewsTagVariant,
  { className: string; showBolt?: boolean }
> = {
  macro: {
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  institutions: {
    className: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
    showBolt: true,
  },
  btc: {
    className: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  eth: {
    className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  sol: {
    className: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  defi: {
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  regulation: {
    className: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <motion.article
      variants={listItemVariants}
      {...interactiveCard}
      className="relative rounded-3xl border border-white/5 bg-[#111113] p-4"
    >
      <span className="absolute right-4 top-4 flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${article.pulseColor}`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${article.pulseColor}`}
        />
      </span>

      <div className="flex flex-wrap gap-1.5 pr-6">
        {article.tags.map((tag) => {
          const style = tagStyles[tag.variant];
          return (
            <span
              key={`${article.id}-${tag.label}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.className}`}
            >
              {style.showBolt && <Zap className="h-2.5 w-2.5 fill-yellow-400" />}
              {tag.label}
            </span>
          );
        })}
      </div>

      <h3 className="mt-3 text-base font-bold leading-snug text-white">
        {article.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        {article.summary}
      </p>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
        {article.source}
      </p>
    </motion.article>
  );
}

export function NewsFeed() {
  const [activeFilter, setActiveFilter] = useState<NewsCategory>("all");

  const filteredArticles = useMemo(() => {
    if (activeFilter === "all") return newsArticles;
    return newsArticles.filter((article) => article.category === activeFilter);
  }, [activeFilter]);

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
            Noviny
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Inštitucionálny radar · BTC, ETH, SOL
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.15)]">
          <Zap className="h-3 w-3 fill-yellow-400" />
          {flashCount} flash
        </span>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {newsFilters.map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <motion.button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              {...interactiveButton}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-emerald-900/60 text-emerald-400 shadow-[0_0_16px_rgba(6,78,59,0.4)]"
                  : "border border-white/5 bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {filter.label}
            </motion.button>
          );
        })}
      </div>

      <motion.div
        key={activeFilter}
        variants={listContainerVariants}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        {filteredArticles.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </motion.div>
    </motion.div>
  );
}
