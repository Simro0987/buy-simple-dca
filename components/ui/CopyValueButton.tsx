"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

interface CopyValueButtonProps {
  value: string;
  label: string;
  compact?: boolean;
  className?: string;
}

export function CopyValueButton({
  value,
  label,
  compact = false,
  className = "",
}: CopyValueButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }, [value]);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        title={copied ? "Skopírované!" : label}
        aria-label={copied ? "Skopírované" : label}
        className={`inline-flex shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] p-1 text-zinc-500 transition-all duration-300 ease-in-out hover:border-emerald-500/25 hover:bg-emerald-500/5 hover:text-emerald-300 ${className}`}
      >
        {copied ? (
          <Check className="h-2.5 w-2.5 text-emerald-400" />
        ) : (
          <Copy className="h-2.5 w-2.5" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-zinc-400 transition-all duration-300 ease-in-out hover:border-emerald-500/25 hover:text-emerald-300 ${className}`}
      aria-label={`${label}: ${value}`}
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-400" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
      {copied ? "Skopírované!" : "Kopírovať"}
    </button>
  );
}
