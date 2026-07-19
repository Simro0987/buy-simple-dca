"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { ExternalLink, Zap } from "lucide-react";
import type { SmartNewsArticle } from "@/lib/newsTokenFilter";
import { isFlashAlertArticle } from "@/lib/newsFlashAlert";
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
  flashArticleId?: string | null;
  onFlashClick?: (article: SmartNewsArticle) => void;
}

export function NewsArticleRow({
  article,
  showTokenBadges = false,
  flashArticleId = null,
  onFlashClick,
}: NewsArticleRowProps) {
  const primaryToken = article.matchedTokens[0];
  const isFlash = isFlashAlertArticle(article, flashArticleId);
  const isMarketStatus = article.isMarketStatus;

  const content = (
    <>
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
          {isFlash && (
            <motion.span
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{
                repeat: Infinity,
                duration: 1.1,
                ease: "easeInOut",
              }}
              className="inline-flex items-center gap-1 rounded-full border border-yellow-400/40 bg-yellow-400/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-yellow-300"
            >
              <Zap className="h-2.5 w-2.5 fill-yellow-400" />
              Flash Alert
            </motion.span>
          )}
          {isMarketStatus && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-300">
              Trhový status
            </span>
          )}
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

      {!isFlash && (
        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-700 transition group-hover:text-zinc-400" />
      )}
    </>
  );

  if (isFlash && onFlashClick) {
    return (
      <motion.button
        type="button"
        onClick={() => onFlashClick(article)}
        variants={listItemVariants}
        animate={{
          boxShadow: [
            "0 0 0 1px rgba(250,204,21,0.35), 0 0 14px rgba(250,204,21,0.12)",
            "0 0 0 2px rgba(250,204,21,0.75), 0 0 24px rgba(250,204,21,0.28)",
            "0 0 0 1px rgba(250,204,21,0.35), 0 0 14px rgba(250,204,21,0.12)",
          ],
        }}
        transition={{
          boxShadow: { repeat: Infinity, duration: 1.6, ease: "easeInOut" },
        }}
        className="group flex w-full gap-3 rounded-2xl border border-yellow-400/30 bg-[#14120a] p-3 text-left transition hover:bg-[#1a170c]"
      >
        {content}
      </motion.button>
    );
  }

  return (
    <motion.a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      variants={listItemVariants}
      className={`group flex gap-3 rounded-2xl border p-3 transition ${
        isMarketStatus
          ? "border-emerald-400/20 bg-emerald-400/5 hover:bg-emerald-400/10"
          : "border-white/5 bg-[#111113] hover:border-white/10 hover:bg-[#161618]"
      }`}
    >
      {content}
    </motion.a>
  );
}
