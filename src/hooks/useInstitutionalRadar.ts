import { useEffect, useState } from 'react';
import type { OctToken } from '@/hooks/useConfluenceMetrics';
import {
  getCachedRadarMessages,
  loadInstitutionalRadarMessages,
  type CachedRadarItem,
} from '@/lib/institutionalRadarCache';

export function useInstitutionalRadar(activeToken: OctToken) {
  const [messages, setMessages] = useState<CachedRadarItem[] | null>(
    () => getCachedRadarMessages(activeToken),
  );
  const [loading, setLoading] = useState(!messages);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedRadarMessages(activeToken);
    if (cached) {
      setMessages(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    void loadInstitutionalRadarMessages(!cached).then(all => {
      if (cancelled) return;
      setMessages(all[activeToken]);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeToken]);

  return { messages, loading };
}
