"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { interactiveButton } from "@/lib/motion";

interface AddAssetButtonProps {
  onClick: () => void;
}

export function AddAssetButton({ onClick }: AddAssetButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      {...interactiveButton}
      className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#111113] px-4 py-3.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/5 hover:text-emerald-400 hover:shadow-[0_0_24px_rgba(52,211,153,0.08)]"
    >
      <Plus className="h-4 w-4 transition group-hover:scale-110" />
      Pridať aktívum
    </motion.button>
  );
}
