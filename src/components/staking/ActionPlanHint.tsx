import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ActionPlanHint({ text }: { text?: string | null }) {
  const hint = text?.trim();
  if (!hint) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors"
          aria-label="Action plan explanation"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-[11px] leading-snug p-3" side="top" align="start">
        {hint}
      </PopoverContent>
    </Popover>
  );
}
