"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const COPY_FEEDBACK_MS = 2000;

interface CopyValueButtonProps {
  value: string;
  label: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  onCopied?: () => void;
}

export function CopyValueButton({
  value,
  label,
  compact = false,
  className = "",
  disabled = false,
  onCopied,
}: CopyValueButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      onCopied?.();
      setCopied(true);
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }, [disabled, onCopied, value]);

  const copiedClass = copied
    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
    : disabled
      ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-600 opacity-50"
      : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-emerald-500/25 hover:bg-emerald-500/5 hover:text-emerald-300";

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={disabled}
        title={copied ? "Skopírované!" : label}
        aria-label={copied ? "Skopírované" : label}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border p-1 transition-all duration-300 ease-in-out ${copiedClass} ${className}`}
      >
        {copied ? (
          <>
            <Check className="h-2.5 w-2.5 text-emerald-400" />
            <span className="text-[8px] font-bold uppercase tracking-wide text-emerald-300">
              OK
            </span>
          </>
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
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-all duration-300 ease-in-out ${copiedClass} ${className}`}
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
