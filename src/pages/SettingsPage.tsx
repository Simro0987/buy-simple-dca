import { useState, useEffect } from 'react';
import { Lang, t } from '@/lib/i18n';
import { Globe, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  lang: Lang;
  toggleLang: () => void;
}

export function SettingsPage({ lang, toggleLang }: Props) {
  const [chatId, setChatId] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('telegram_chat_id');
    if (saved) setChatId(saved);
  }, []);

  const saveChatId = (value: string) => {
    setChatId(value);
    localStorage.setItem('telegram_chat_id', value);
  };

  const sendTestAlert = async () => {
    if (!chatId.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-news-alert', {
        body: {
          chatId: chatId.trim(),
          news: [
            {
              title: '🧪 Test alert – Tvoj Telegram je prepojený!',
              url: 'https://example.com',
              sentiment: 'bullish',
              tokens: ['BTC'],
            },
          ],
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed');
      toast.success(t('testAlertSuccess', lang));
    } catch (err: any) {
      toast.error(t('testAlertError', lang) + ': ' + (err.message || ''));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">{t('settings', lang)}</h1>

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

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Send className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">{t('telegramAlerts', lang)}</span>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">{t('chatId', lang)}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => saveChatId(e.target.value)}
              placeholder={t('chatIdPlaceholder', lang)}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={sendTestAlert}
              disabled={!chatId.trim() || sending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
            >
              {sending ? '...' : t('testAlert', lang)}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t('telegramHint', lang)}</p>
        </div>
      </div>
    </div>
  );
}
