"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

interface DcaCollapsibleDetailsProps {
  children: ReactNode;
  collapsedLabel?: string;
  expandedLabel?: string;
  className?: string;
}

export function DcaCollapsibleDetails({
  children,
  collapsedLabel = "Zobraziť analytické detaily",
  expandedLabel = "Skryť analytické detaily",
  className = "",
}: DcaCollapsibleDetailsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-left transition-colors duration-200 hover:bg-white/[0.04]"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold text-zinc-400">
          {open ? expandedLabel : collapsedLabel}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
