import { Lang, t } from '@/lib/i18n';
import { Globe } from 'lucide-react';

interface Props {
  lang: Lang;
  toggleLang: () => void;
}

export function SettingsPage({ lang, toggleLang }: Props) {
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
    </div>
  );
}
