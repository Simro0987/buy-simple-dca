"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { ExternalLink, Zap } from "lucide-react";
import type { SmartNewsArticle } from "@/lib/newsTokenFilter";
import { TokenBadgeList } from "@/components/TokenBadge";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";

function formatRelativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `pred ${hours} h`;
  const days = Math.floor(hours / 24);
  return `pred ${days} d`;
}

interface NewsHeroCardProps {
  article: SmartNewsArticle | null;
  imageUrl?: string;
  loading?: boolean;
  showTokenBadges?: boolean;
}

export function NewsHeroCard({
  article,
  imageUrl,
  loading = false,
  showTokenBadges = false,
}: NewsHeroCardProps) {
  if (loading) {
    return <PriceSkeleton className="h-72 w-full rounded-3xl" />;
  }

  if (!article) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
        <p className="text-sm text-zinc-500">Žiadne správy nie sú dostupné.</p>
      </div>
    );
  }

  return (
    <motion.a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#111113]"
    >
      <div className="relative h-52 w-full overflow-hidden sm:h-60">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
            priority
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#050505] via-[#111113] to-emerald-950/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />

        {article.isFlash && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-yellow-400">
            <Zap className="h-3 w-3 fill-yellow-400" />
            Flash
          </span>
        )}
      </div>

      <div className="relative p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-white/10">
            <Image
              src={article.sourceLogoUrl}
              alt={article.source}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
            {article.source}
          </span>
          <span className="text-[10px] text-zinc-600">
            {formatRelativeTime(article.publishedAt)}
          </span>
          <ExternalLink className="ml-auto h-3.5 w-3.5 text-zinc-600 transition group-hover:text-zinc-300" />
        </div>

        <h3 className="text-xl font-bold leading-snug text-white transition group-hover:text-emerald-300 sm:text-2xl">
          {article.title}
        </h3>
        {article.summary && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
            {article.summary}
          </p>
        )}
        {showTokenBadges && article.matchedTokens.length > 0 && (
          <div className="mt-3">
            <TokenBadgeList tokens={article.matchedTokens} max={4} />
          </div>
        )}
      </div>
    </motion.a>
  );
}
