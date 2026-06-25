import { Lang } from '@/lib/i18n';
import type { DecisionRating } from '@/lib/hcdDecisionLog';

interface Props {
  lang: Lang;
  stepKey: string;
  rating: DecisionRating | null;
  confidenceScore?: number;
  onRate: (rating: DecisionRating) => void;
}

export function DecisionFeedbackButtons({ lang, stepKey, rating, confidenceScore, onRate }: Props) {
  const sk = lang === 'sk';
  if (!stepKey) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-border/30">
      <div className="min-w-0">
        <p className="text-[9px] text-muted-foreground">
          {sk ? 'Ohodnoťte rozhodnutie:' : 'Rate this decision:'}
        </p>
        {confidenceScore != null && (
          <p className="text-[9px] text-emerald-400/90 tabular-nums mt-0.5">
            {sk ? 'Confidence Score' : 'Confidence Score'}: {confidenceScore}%
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onRate('up')}
          title={sk ? 'Dobré rozhodnutie' : 'Good decision'}
          className={`h-8 w-8 rounded-lg border text-base leading-none touch-manipulation transition-colors ${
            rating === 'up'
              ? 'border-emerald-500/60 bg-emerald-500/20'
              : 'border-border/50 bg-background/40 hover:bg-emerald-500/10'
          }`}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => onRate('down')}
          title={sk ? 'Zlá skúsenosť' : 'Bad experience'}
          className={`h-8 w-8 rounded-lg border text-base leading-none touch-manipulation transition-colors ${
            rating === 'down'
              ? 'border-red-500/60 bg-red-500/20'
              : 'border-border/50 bg-background/40 hover:bg-red-500/10'
          }`}
        >
          👎
        </button>
      </div>
    </div>
  );
}
