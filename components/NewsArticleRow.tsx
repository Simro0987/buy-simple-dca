"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import type { SmartNewsArticle } from "@/lib/newsTokenFilter";
import { TokenBadgeList } from "@/components/TokenBadge";
import { listItemVariants } from "@/lib/motion";

function formatRelativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `pred ${hours} h`;
  const days = Math.floor(hours / 24);
  return `pred ${days} d`;
}

interface NewsArticleRowProps {
  article: SmartNewsArticle;
  showTokenBadges?: boolean;
}

export function NewsArticleRow({
  article,
  showTokenBadges = false,
}: NewsArticleRowProps) {
  const primaryToken = article.matchedTokens[0];

  return (
    <motion.a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      variants={listItemVariants}
      className="group flex gap-3 rounded-2xl border border-white/5 bg-[#111113] p-3 transition hover:border-white/10 hover:bg-[#161618]"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10">
        <Image
          src={article.imageUrl}
          alt={article.title}
          fill
          className="object-cover"
          unoptimized
        />

        <div className="absolute left-1 top-1 h-5 w-5 overflow-hidden rounded-full ring-1 ring-black/50">
          <Image
            src={article.sourceLogoUrl}
            alt={article.source}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {primaryToken && (
          <div className="absolute right-1 top-1 h-5 w-5 overflow-hidden rounded-full bg-black/70 ring-1 ring-white/20">
            {primaryToken.logoUrl ? (
              <Image
                src={primaryToken.logoUrl}
                alt={primaryToken.symbol}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[7px] font-bold text-white">
                {primaryToken.symbol.slice(0, 2)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
            {article.source}
          </span>
          <span className="text-[10px] text-zinc-600">
            {formatRelativeTime(article.publishedAt)}
          </span>
        </div>
        <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition group-hover:text-emerald-300">
          {article.title}
        </h4>
        {article.summary && (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
            {article.summary}
          </p>
        )}
        {showTokenBadges && article.matchedTokens.length > 0 && (
          <div className="mt-2">
            <TokenBadgeList tokens={article.matchedTokens} />
          </div>
        )}
      </div>

      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-700 transition group-hover:text-zinc-400" />
    </motion.a>
  );
}
