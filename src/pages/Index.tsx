import { useState } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { useLanguage } from '@/hooks/useLanguage';
import { OverviewPage } from '@/pages/OverviewPage';
import { DCAPage } from '@/pages/DCAPage';
import { ActionPage } from '@/pages/ActionPage';
import { SmartAllocPage } from '@/pages/SmartAllocPage';
import { PortfolioPage } from '@/pages/PortfolioPage';
import { WalletsPage } from '@/pages/WalletsPage';
import { StakingPage } from '@/pages/StakingPage';
import { SettingsPage } from '@/pages/SettingsPage';

const Index = () => {
  const [tab, setTab] = useState<TabId>('overview');
  const { lang, toggleLang } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24">
        {tab === 'overview' && <OverviewPage lang={lang} />}
        {tab === 'smart' && <SmartAllocPage lang={lang} />}
        {tab === 'dca' && <DCAPage lang={lang} />}
        {tab === 'action' && <ActionPage lang={lang} />}
        {tab === 'wallets' && <WalletsPage lang={lang} />}
        {tab === 'staking' && <StakingPage lang={lang} />}
        {tab === 'portfolio' && <PortfolioPage lang={lang} />}
        {tab === 'settings' && <SettingsPage lang={lang} toggleLang={toggleLang} />}
      </main>
      <BottomNav active={tab} onChange={setTab} lang={lang} />
    </div>
  );
};

export default Index;
