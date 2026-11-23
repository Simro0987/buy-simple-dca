import { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Lightweight collapsible section (native <details>), used to keep long pages short. */
export function Collapsible({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-card/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {subtitle && <span className="block text-[11px] text-muted-foreground truncate">{subtitle}</span>}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 space-y-4">{children}</div>
    </details>
  );
}
