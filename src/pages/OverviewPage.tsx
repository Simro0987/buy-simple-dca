import { Lang } from '@/lib/i18n';
import { CryptoNewsFeed } from '@/components/CryptoNewsFeed';

interface Props {
  lang: Lang;
}

/**
 * News: only live sources (crypto-news server function: CryptoPanic/RSS, classified by AI or
 * keywords). The previous hard-coded headlines were removed because they were outdated.
 */
export function OverviewPage({ lang }: Props) {
  const sk = lang === 'sk';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">{sk ? 'Správy' : 'News'}</h1>
        <p className="text-xs text-muted-foreground">
          {sk
            ? 'Živé správy k tokenom v portfóliu. Dopad (vysoký/stredný/nízky) je automatická klasifikácia, nie odporúčanie.'
            : 'Live news for your portfolio tokens. Impact is an automatic classification, not advice.'}
        </p>
      </div>
      <div className="max-w-3xl">
        <CryptoNewsFeed lang={lang} />
      </div>
    </div>
  );
}
