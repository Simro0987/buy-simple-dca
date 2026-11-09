import { Bot } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { useHcdTemperament } from '@/hooks/useHcdTemperament';
import { temperamentLabel } from '@/lib/hcdTemperament';
import { Slider } from '@/components/ui/slider';

interface Props {
  lang: Lang;
}

export function CyborgTuningCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { temperamentPct, setTemperamentPct } = useHcdTemperament();

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Bot className="w-5 h-5 text-violet-400" />
        <div>
          <h2 className="font-medium text-foreground">
            {sk ? 'Cyborg Tuning' : 'Cyborg Tuning'}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {sk ? 'Temperament HCD mozgu a koeficienty rizika' : 'HCD brain temperament and risk coefficients'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">
            {sk ? 'Temperament Mozgu' : 'Brain Temperament'}
          </span>
          <span className="text-sm font-mono font-semibold text-violet-300 tabular-nums">
            {temperamentPct}% · {temperamentLabel(temperamentPct, sk)}
          </span>
        </div>

        <Slider
          value={[temperamentPct]}
          min={0}
          max={100}
          step={1}
          onValueChange={([value]) => setTemperamentPct(value)}
          className="py-1"
        />

        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{sk ? '0% Konzervatívny' : '0% Conservative'}</span>
          <span>{sk ? '100% Agresívny' : '100% Aggressive'}</span>
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          {sk
            ? 'Nižší temperament = nižšie LTV a vyššia bezpečnosť. Vyšší temperament = vyššie LTV a väčší dôraz na výnosové vrstvy.'
            : 'Lower temperament = lower LTV and higher safety. Higher temperament = higher LTV and more yield-seeking layer bias.'}
        </p>
      </div>
    </div>
  );
}
