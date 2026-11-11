import { useState, useCallback } from 'react';
import { Lang, t, TranslationKey } from '@/lib/i18n';

export function useLanguage() {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('app-lang') as Lang) || 'sk';
  });

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'sk' ? 'en' : 'sk';
      localStorage.setItem('app-lang', next);
      return next;
    });
  }, []);

  const tr = useCallback((key: TranslationKey) => t(key, lang), [lang]);

  return { lang, setLang, toggleLang, tr };
}
