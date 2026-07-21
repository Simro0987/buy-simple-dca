"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

interface CopyValueButtonProps {
  value: string;
  label: string;
  className?: string;
}

export function CopyValueButton({
  value,
  label,
  className = "",
}: CopyValueButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 transition-all duration-500 ease-in-out hover:border-emerald-500/30 hover:text-emerald-300 ${className}`}
      aria-label={`${label}: ${value}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Skopírované" : label}
    </button>
  );
}
