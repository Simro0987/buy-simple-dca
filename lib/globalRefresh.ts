/** Shared interval for app-wide live data polling (60 seconds). */
export const GLOBAL_REFRESH_MS = 60_000;

export const GLOBAL_REFRESH_EVENT = "edge-trader:global-refresh";

type RefreshHandler = () => void | Promise<void>;

const handlers = new Map<string, RefreshHandler>();

export function registerGlobalRefreshHandler(
  key: string,
  handler: RefreshHandler,
): () => void {
  handlers.set(key, handler);
  return () => {
    handlers.delete(key);
  };
}

export async function runGlobalRefreshHandlers(): Promise<void> {
  await Promise.allSettled(
    Array.from(handlers.values()).map((handler) => Promise.resolve(handler())),
  );
}

export function dispatchGlobalRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GLOBAL_REFRESH_EVENT));
}

export function formatGlobalLastUpdated(value: Date | string | null): string {
  if (!value) return "Synchronizácia…";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Synchronizácia…";

  return date.toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
