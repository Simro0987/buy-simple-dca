import { useEffect, useRef } from 'react';

interface Options {
  enabled?: boolean;
  rootMargin?: string;
  onIntersect: () => void;
}

export function useInfiniteScrollSentinel({
  enabled = true,
  rootMargin = '200px',
  onIntersect,
}: Options) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onIntersectRef = useRef(onIntersect);

  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!enabled) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          onIntersectRef.current();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}
