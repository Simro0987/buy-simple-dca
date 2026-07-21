"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { ExternalLink, X, Zap } from "lucide-react";
import { useEffect } from "react";
import type { SmartNewsArticle } from "@/lib/newsTokenFilter";
import { TokenBadgeList } from "@/components/TokenBadge";

function formatRelativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `pred ${hours} h`;
  const days = Math.floor(hours / 24);
  return `pred ${days} d`;
}

interface FlashAlertModalProps {
  article: SmartNewsArticle | null;
  open: boolean;
  onClose: () => void;
}

export function FlashAlertModal({
  article,
  open,
  onClose,
}: FlashAlertModalProps) {
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

  return (
    <AnimatePresence>
      {open && article && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md sm:p-8"
          onClick={onClose}
        >
          <motion.article
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-yellow-400/25 bg-[#0a0a0b] shadow-[0_0_60px_rgba(250,204,21,0.12)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavrieť"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 text-zinc-300 transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative h-48 w-full shrink-0 sm:h-56">
              <Image
                src={article.imageUrl}
                alt={article.title}
                fill
                className="object-cover"
                unoptimized
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0b] via-[#0a0a0b]/50 to-transparent" />

              <motion.span
                animate={{ opacity: [1, 0.45, 1] }}
                transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-400/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-300"
              >
                <Zap className="h-3 w-3 fill-yellow-400" />
                Flash Alert
              </motion.span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
              <div className="mb-4 flex flex-wrap items-center gap-2">
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
              </div>

              <h2 className="text-2xl font-bold leading-snug text-white sm:text-3xl">
                {article.title}
              </h2>

              {article.summary && (
                <p className="mt-4 text-base leading-relaxed text-zinc-300">
                  {article.summary}
                </p>
              )}

              {article.matchedTokens.length > 0 && (
                <div className="mt-5">
                  <TokenBadgeList tokens={article.matchedTokens} max={6} />
                </div>
              )}

              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-400/20"
              >
                Otvoriť pôvodný článok
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
