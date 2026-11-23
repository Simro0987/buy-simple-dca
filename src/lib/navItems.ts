import { Home, Newspaper, PieChart, Calculator, Repeat, Activity, DollarSign, Coins, Wallet, Bot, Settings } from 'lucide-react';

/** One navigation model for the sidebar (desktop) and the bottom bar (mobile). */
export type TabId =
  | 'home'
  | 'overview'
  | 'portfolio'
  | 'dca'
  | 'swap'
  | 'market'
  | 'profit'
  | 'staking'
  | 'wallets'
  | 'agent'
  | 'settings';

/** Old tab ids (risk / analysis were the same page as market). */
const ALIASES: Record<string, TabId> = { risk: 'market', analysis: 'market' };

export function normalizeTab(id: string | undefined | null): TabId | null {
  if (!id) return null;
  const t = ALIASES[id] ?? id;
  return NAV_ITEMS.some((n) => n.id === t) ? (t as TabId) : null;
}

export interface NavItem {
  id: TabId;
  sk: string;
  en: string;
  icon: typeof Home;
  /** Shown in the mobile bottom bar (the rest is reachable from "Viac"/Home). */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', sk: 'Domov', en: 'Home', icon: Home, mobile: true },
  { id: 'dca', sk: 'DCA', en: 'DCA', icon: Calculator, mobile: true },
  { id: 'portfolio', sk: 'Portfólio', en: 'Portfolio', icon: PieChart, mobile: true },
  { id: 'market', sk: 'Trh & Riziko', en: 'Market & Risk', icon: Activity, mobile: true },
  { id: 'profit', sk: 'Zisky', en: 'Profits', icon: DollarSign, mobile: true },
  { id: 'staking', sk: 'Staking', en: 'Staking', icon: Coins, mobile: true },
  { id: 'swap', sk: 'Swap', en: 'Swap', icon: Repeat, mobile: true },
  { id: 'overview', sk: 'Správy', en: 'News', icon: Newspaper, mobile: true },
  { id: 'wallets', sk: 'Peňaženky', en: 'Wallets', icon: Wallet, mobile: true },
  { id: 'agent', sk: 'Agent', en: 'Agent', icon: Bot, mobile: true },
  { id: 'settings', sk: 'Nastavenia', en: 'Settings', icon: Settings, mobile: true },
];
