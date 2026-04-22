import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/notificationPrefs', () => ({
  getNotificationPrefs: () => ({ browserNotifications: false, soundAlerts: false }),
}));

// Force TOKENS so that limitDiscount > 1, meaning currentPrice <= limitPrice
// triggers an alert when currentPrice meets the threshold (testable scenario).
vi.mock('@/lib/crypto', () => ({
  TOKENS: [
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', allocation: 1, limitDiscount: 1.05, color: '#000', coingeckoId: 'bitcoin' },
  ],
}));

import { usePriceAlerts } from './usePriceAlerts';
import type { PriceData } from '@/lib/crypto';

const ALERTED_KEY = 'price-alert-sent';

describe('usePriceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    // Stub navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const pricesAtThreshold: PriceData = { bitcoin: { usd: 100 } };
  // limitPrice = 100 * 1.05 = 105 → 100 <= 105 → trigger

  it('triggers a toast when currentPrice falls under the limit', () => {
    renderHook(() => usePriceAlerts(pricesAtThreshold, 'sk'));

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('BTC'),
      expect.objectContaining({ duration: 10000 }),
    );

    // Cooldown timestamp persisted
    const stored = JSON.parse(localStorage.getItem(ALERTED_KEY) || '{}');
    expect(stored.BTC).toBe(Date.now());
  });

  it('does NOT trigger when there are no prices', () => {
    renderHook(() => usePriceAlerts(undefined, 'sk'));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('does NOT re-trigger within the 1-hour cooldown window', () => {
    // Pre-seed an alert sent 30 minutes ago
    localStorage.setItem(
      ALERTED_KEY,
      JSON.stringify({ BTC: Date.now() - 30 * 60 * 1000 }),
    );

    renderHook(() => usePriceAlerts(pricesAtThreshold, 'sk'));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('re-triggers after the 1-hour cooldown elapses', () => {
    // Pre-seed an alert sent 61 minutes ago (cooldown = 60 min)
    localStorage.setItem(
      ALERTED_KEY,
      JSON.stringify({ BTC: Date.now() - 61 * 60 * 1000 }),
    );

    renderHook(() => usePriceAlerts(pricesAtThreshold, 'sk'));
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('uses English title when lang=en', () => {
    renderHook(() => usePriceAlerts(pricesAtThreshold, 'en'));
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('dropped below limit price'),
      expect.anything(),
    );
  });

  it('uses Slovak title when lang=sk', () => {
    renderHook(() => usePriceAlerts(pricesAtThreshold, 'sk'));
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('klesol pod limit cenu'),
      expect.anything(),
    );
  });

  it('throttles repeated checks within 30 seconds (per-mount checkedRef)', () => {
    const { rerender } = renderHook(
      ({ prices }: { prices: PriceData }) => usePriceAlerts(prices, 'sk'),
      { initialProps: { prices: pricesAtThreshold } },
    );

    expect(toast.warning).toHaveBeenCalledTimes(1);

    // Clear cooldown so only the 30s throttle would prevent re-trigger
    localStorage.removeItem(ALERTED_KEY);
    vi.mocked(toast.warning).mockClear();

    // Advance only 10s, then rerender with a new price object reference
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    rerender({ prices: { bitcoin: { usd: 100 } } });

    // 30s throttle should suppress this run
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
