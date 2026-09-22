"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyGlyphProps {
  label: string;
  value: string;
  onCopied?: (message: string) => void;
}

export function CopyGlyph({ label, value, onCopied }: CopyGlyphProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.("Skopírované!");
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      onCopied?.("Kopírovanie zlyhalo");
    }
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void handleCopy();
      }}
      aria-label={label}
      title={copied ? "Skopírované!" : label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-300"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}
