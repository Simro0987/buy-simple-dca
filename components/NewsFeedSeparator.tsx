"use client";

import { motion } from "framer-motion";

export function NewsFeedSeparator() {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.9 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex items-center gap-3 py-2"
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700/70 to-transparent" />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-600">
        Ďalšie novinky
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700/70 to-transparent" />
    </motion.div>
  );
}
