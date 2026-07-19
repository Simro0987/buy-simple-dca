"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePrivacy } from "@/context/PrivacyContext";

interface MaskedValueProps {
  children: React.ReactNode;
  masked?: string;
  className?: string;
}

export function MaskedValue({
  children,
  masked = "****",
  className,
}: MaskedValueProps) {
  const { isPrivacyMode } = usePrivacy();

  return (
    <span className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isPrivacyMode ? "masked" : "visible"}
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="inline-block"
        >
          {isPrivacyMode ? masked : children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
