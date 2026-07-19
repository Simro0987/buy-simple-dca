"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
}

export function Toast({ message, visible, onClose }: ToastProps) {
  useEffect(() => {
    if (!visible) return;

    const timer = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timer);
  }, [visible, onClose]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[120] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-emerald-400/30 bg-zinc-900/95 px-4 py-3 shadow-[0_0_32px_rgba(52,211,153,0.2)] backdrop-blur-xl"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <p className="text-sm font-semibold text-white">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
