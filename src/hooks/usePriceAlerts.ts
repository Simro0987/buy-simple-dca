import { useEffect, useRef } from 'react';
import { PriceData, TOKENS } from '@/lib/crypto';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { getNotificationPrefs } from '@/lib/notificationPrefs';

/** Request notification permission on first use */
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function showBrowserNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const options: NotificationOptions & Record<string, unknown> = {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'price-alert',
    };
    (options as NotificationOptions & { renotify?: boolean }).renotify = true;
    new Notification(title, options);
  } catch {
    // Notification API not available
  }
}

function playAlertSound() {
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    // Second beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.6);
  } catch {
    // Web Audio not supported
  }
}

const ALERTED_KEY = 'price-alert-sent';

function getAlerted(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(ALERTED_KEY) || '{}'); } catch { return {}; }
}

function setAlerted(symbol: string, ts: number) {
  const data = getAlerted();
  data[symbol] = ts;
  localStorage.setItem(ALERTED_KEY, JSON.stringify(data));
}

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per token

export function usePriceAlerts(prices: PriceData | undefined, lang: Lang) {
  const checkedRef = useRef(0);
  const permissionRequested = useRef(false);

  // Request permission once
  useEffect(() => {
    if (!permissionRequested.current) {
      permissionRequested.current = true;
      requestNotificationPermission();
    }
  }, []);

  useEffect(() => {
    if (!prices) return;
    const now = Date.now();
    if (now - checkedRef.current < 30_000) return;
    checkedRef.current = now;

    const alerted = getAlerted();
    const sk = lang === 'sk';
    const prefs = getNotificationPrefs();

    for (const token of TOKENS) {
      const currentPrice = prices[token.coingeckoId]?.usd;
      if (!currentPrice) continue;

      const limitPrice = currentPrice * token.limitDiscount;

      if (currentPrice <= limitPrice) {
        const lastAlert = alerted[token.symbol] || 0;
        if (now - lastAlert < COOLDOWN_MS) continue;

        setAlerted(token.symbol, now);

        const pctBelow = ((limitPrice - currentPrice) / limitPrice * 100).toFixed(1);
        if (prefs.soundAlerts) playAlertSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

        const title = sk
          ? `🚨 ${token.symbol} klesol pod limit cenu!`
          : `🚨 ${token.symbol} dropped below limit price!`;
        const description = sk
          ? `Aktuálna: $${currentPrice.toLocaleString()} · Limit: $${limitPrice.toLocaleString()} · ${pctBelow}% pod limitom`
          : `Current: $${currentPrice.toLocaleString()} · Limit: $${limitPrice.toLocaleString()} · ${pctBelow}% below`;

        // Browser notification
        if (prefs.browserNotifications) {
          showBrowserNotification(title, description);
        }

        // In-app toast
        toast.warning(title, { description, duration: 10000 });
      }
    }
  }, [prices, lang]);
}
