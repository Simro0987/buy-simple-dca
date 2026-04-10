import { useState, useEffect, useCallback } from 'react';
import { Lang, t } from '@/lib/i18n';
import { Globe, Send, Bell, TrendingDown, Newspaper, Calendar, Sun, Moon, Monitor, Volume2, BellRing } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CsvExport } from '@/components/CsvExport';
import { toast } from 'sonner';
import type { Theme } from '@/hooks/useTheme';
import { getNotificationPrefs, setNotificationPrefs, type NotificationPrefs } from '@/lib/notificationPrefs';

const syncConfigToDb = async (chatId: string, budget: number, alerts: { dcaReminder: boolean; limitProximity: boolean; highImpactNews: boolean }) => {
  try {
    await supabase.from('telegram_config').update({
      chat_id: chatId,
      weekly_budget: budget,
      dca_reminder_enabled: alerts.dcaReminder,
      limit_alert_enabled: alerts.limitProximity,
      news_alert_enabled: alerts.highImpactNews,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
  } catch (e) {
    console.error('Failed to sync config to DB:', e);
  }
};

interface Props {
  lang: Lang;
  toggleLang: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

interface AlertToggles {
  dcaReminder: boolean;
  limitProximity: boolean;
  highImpactNews: boolean;
}

export function SettingsPage({ lang, toggleLang, theme, setTheme }: Props) {
  const [chatId, setChatId] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertToggles>({
    dcaReminder: true,
    limitProximity: true,
    highImpactNews: true,
  });
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(getNotificationPrefs);

  useEffect(() => {
    const saved = localStorage.getItem('telegram_chat_id');
    if (saved) setChatId(saved);
    const savedAlerts = localStorage.getItem('telegram_alert_toggles');
    if (savedAlerts) {
      try { setAlerts(JSON.parse(savedAlerts)); } catch {}
    }
  }, []);

  const toggleNotifPref = (key: keyof NotificationPrefs) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    setNotificationPrefs(updated);
    if (key === 'browserNotifications' && updated.browserNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const saveChatId = (value: string) => {
    setChatId(value);
    localStorage.setItem('telegram_chat_id', value);
    const budget = Number(localStorage.getItem('dca-budget') || '100');
    syncConfigToDb(value, budget, alerts);
  };

  const toggleAlert = (key: keyof AlertToggles) => {
    const updated = { ...alerts, [key]: !alerts[key] };
    setAlerts(updated);
    localStorage.setItem('telegram_alert_toggles', JSON.stringify(updated));
    const budget = Number(localStorage.getItem('dca-budget') || '100');
    syncConfigToDb(chatId, budget, updated);
  };

  const sendTestAlert = async (type: 'news' | 'dca' | 'price') => {
    if (!chatId.trim()) return;
    setSending(type);
    try {
      let fnName = '';
      let body: any = {};

      if (type === 'news') {
        fnName = 'telegram-news-alert';
        body = {
          chatId: chatId.trim(),
          news: [{
            title: '🧪 Test – Telegram je prepojený!',
            url: 'https://example.com',
            sentiment: 'bullish',
            tokens: ['BTC'],
          }],
        };
      } else if (type === 'dca') {
        fnName = 'telegram-dca-reminder';
        const budget = Number(localStorage.getItem('dca-budget') || '100');
        body = { chatId: chatId.trim(), budget };
      } else {
        fnName = 'telegram-price-alert';
        body = { chatId: chatId.trim() };
      }

      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed');
      toast.success(t('testAlertSuccess', lang));
    } catch (err: any) {
      toast.error(t('testAlertError', lang) + ': ' + (err.message || ''));
    } finally {
      setSending(null);
    }
  };

  const alertTypes = [
    {
      key: 'dcaReminder' as const,
      icon: Calendar,
      label: t('alertDcaReminder', lang),
      desc: t('alertDcaDesc', lang),
      testType: 'dca' as const,
      testLabel: t('sendDcaTest', lang),
    },
    {
      key: 'limitProximity' as const,
      icon: TrendingDown,
      label: t('alertLimitProximity', lang),
      desc: t('alertLimitDesc', lang),
      testType: 'price' as const,
      testLabel: t('sendPriceTest', lang),
    },
    {
      key: 'highImpactNews' as const,
      icon: Newspaper,
      label: t('alertHighImpactNews', lang),
      desc: t('alertNewsDesc', lang),
      testType: 'news' as const,
      testLabel: t('testAlert', lang),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">{t('settings', lang)}</h1>

      {/* Language */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-foreground">{t('language', lang)}</span>
          </div>
          <button
            onClick={toggleLang}
            className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium text-sm"
          >
            {lang === 'sk' ? '🇸🇰 Slovenčina' : '🇬🇧 English'}
          </button>
        </div>
      </div>

      {/* Theme */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sun className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-foreground">{t('theme', lang)}</span>
          </div>
          <div className="flex rounded-lg bg-secondary overflow-hidden">
            {([
              { value: 'light' as Theme, icon: Sun, label: t('themeLight', lang) },
              { value: 'dark' as Theme, icon: Moon, label: t('themeDark', lang) },
              { value: 'system' as Theme, icon: Monitor, label: t('themeSystem', lang) },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  theme === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Telegram Chat ID */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Send className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">{t('telegramAlerts', lang)}</span>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">{t('chatId', lang)}</label>
          <input
            type="text"
            value={chatId}
            onChange={(e) => saveChatId(e.target.value)}
            placeholder={t('chatIdPlaceholder', lang)}
            className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">{t('telegramHint', lang)}</p>
        </div>
      </div>

      {/* Alert Types */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">{t('alertSettings', lang)}</span>
        </div>

        <div className="space-y-3">
          {alertTypes.map(({ key, icon: Icon, label, desc, testType, testLabel }) => (
            <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <Icon className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground text-sm">{label}</span>
                  <button
                    onClick={() => toggleAlert(key)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      alerts[key] ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground transition-transform ${
                        alerts[key] ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                {chatId.trim() && alerts[key] && (
                  <button
                    onClick={() => sendTestAlert(testType)}
                    disabled={sending !== null}
                    className="mt-2 px-3 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium disabled:opacity-50"
                  >
                    {sending === testType ? '...' : testLabel}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* In-App Notification Preferences */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <BellRing className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {lang === 'sk' ? 'Notifikácie v aplikácii' : 'In-App Notifications'}
          </span>
        </div>

        <div className="space-y-3">
          {([
            {
              key: 'browserNotifications' as const,
              icon: Bell,
              label: lang === 'sk' ? 'Browser notifikácie' : 'Browser notifications',
              desc: lang === 'sk' ? 'Systémové push notifikácie pri cenových alertoch' : 'System push notifications for price alerts',
            },
            {
              key: 'soundAlerts' as const,
              icon: Volume2,
              label: lang === 'sk' ? 'Zvukové alerty' : 'Sound alerts',
              desc: lang === 'sk' ? 'Zvukový signál pri cenových alertoch' : 'Audio beep on price alerts',
            },
          ]).map(({ key, icon: Icon, label, desc }) => (
            <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <Icon className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground text-sm">{label}</span>
                  <button
                    onClick={() => toggleNotifPref(key)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      notifPrefs[key] ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground transition-transform ${
                        notifPrefs[key] ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSV Export */}
      <CsvExport lang={lang} />
    </div>
  );
}
