"use client";

import { AlertTriangle } from "lucide-react";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";

export function LiveMetricSkeleton({ className = "h-6 w-20" }: { className?: string }) {
  return <PriceSkeleton className={className} />;
}

export function LiveMetricUnavailable({ label }: { label: string }) {
  return (
    <span
      role="status"
      className="font-mono text-[10px] font-bold uppercase tracking-wide text-[#FF2A6D]"
    >
      {label} · API n/a
    </span>
  );
}

export function LiveDataAlert({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border border-[#FF2A6D] bg-[rgba(255,42,109,0.12)] px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF2A6D]" />
      <div>
        <p className="text-sm font-semibold text-[#FF2A6D]">{title}</p>
        <p className="mt-0.5 text-xs text-[#FF2A6D]/75">{detail}</p>
      </div>
    </div>
  );
}
