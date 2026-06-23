import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { useCryptoNews } from '@/hooks/useCryptoNews';
import type { Lang } from '@/lib/i18n';

interface Props { lang?: Lang }

const DISMISSED_KEY = 'flash-alert-dismissed-ids';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); }
  catch { return []; }
}

export function FlashAlertBanner({ lang = 'sk' }: Props) {
  const { data } = useCryptoNews(undefined, lang);
  const [dismissed, setDismissed] = useState<string[]>(getDismissed);

  const flash = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    return data.find(n => {
      if (!n.flash) return false;
      const age = now - new Date(n.publishedAt).getTime();
      if (age > MAX_AGE_MS) return false;
      return !dismissed.includes(String(n.id));
    }) || null;
  }, [data, dismissed]);

  if (!flash) return null;

  function handleDismiss() {
    if (!flash) return;
    const id = String(flash.id);
    const next = [...dismissed, id].slice(-50);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    setDismissed(next);
  }

  return (
    <div
      role="alert"
      className="relative rounded-xl border border-red-500/60 bg-gradient-to-r from-red-600/20 via-orange-500/20 to-red-600/20 p-3 pr-9 shadow-lg shadow-red-500/20 animate-pulse-slow"
      style={{ animation: 'flashPulse 1.6s ease-in-out infinite' }}
    >
      <style>{`@keyframes flashPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
        50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
      }`}</style>

      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-500/30 transition-colors"
        aria-label="Zavrieť"
      >
        <X className="w-3.5 h-3.5 text-red-100" />
      </button>

      <a
        href={flash.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2.5"
      >
        <div className="shrink-0 mt-0.5 rounded-full bg-red-500/30 p-1.5">
          <AlertTriangle className="w-4 h-4 text-red-100" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-100">
              ⚡ Flash Alert
            </span>
            {flash.tokens.length > 0 && (
              <span className="text-[9px] text-red-200/80 font-semibold">
                {flash.tokens.join(' · ')}
              </span>
            )}
          </div>
          <p className="text-[12px] font-bold leading-snug text-white mt-0.5 line-clamp-2">
            {flash.title}
          </p>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-red-100/80 font-medium">
            Otvoriť článok <ExternalLink className="w-2.5 h-2.5" />
            <span className="ml-auto text-red-200/60">{flash.source}</span>
          </div>
        </div>
      </a>
    </div>
  );
}
