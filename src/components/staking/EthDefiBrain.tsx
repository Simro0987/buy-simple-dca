import { Lang } from '@/lib/i18n';
import { FiveLayerBrain } from './FiveLayerBrain';

/** ETH tab — full 5-layer architecture with dynamic native-staking / DeFi split. */
export function EthDefiBrain({ lang }: { lang: Lang; marketScore?: number }) {
  return <FiveLayerBrain lang={lang} asset="ETH" />;
}
