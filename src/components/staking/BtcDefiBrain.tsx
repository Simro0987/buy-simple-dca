import { Lang } from '@/lib/i18n';
import { FiveLayerBrain } from './FiveLayerBrain';

/** BTC tab — full 5-layer architecture with background robo-advisor math (advisory only). */
export function BtcDefiBrain({ lang }: { lang: Lang }) {
  return <FiveLayerBrain lang={lang} asset="BTC" />;
}
