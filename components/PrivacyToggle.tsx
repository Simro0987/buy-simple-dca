"use client";

import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/context/PrivacyContext";

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className = "" }: PrivacyToggleProps) {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  return (
    <motion.button
      type="button"
      onClick={togglePrivacyMode}
      aria-label={isPrivacyMode ? "Zobraziť hodnoty" : "Skryť hodnoty"}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900/50 text-zinc-400 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-200 ${className}`}
    >
      {isPrivacyMode ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </motion.button>
  );
}
