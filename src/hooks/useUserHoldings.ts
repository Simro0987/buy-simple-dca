import { useCallback, useEffect, useState } from 'react';
import {
  loadUserHoldings,
  saveUserHoldings,
  PORTFOLIO_HOLDINGS_UPDATED_EVENT,
  type UserHoldings,
} from '@/lib/portfolioRealHoldings';

export function useUserHoldings() {
  const [holdings, setHoldings] = useState<UserHoldings>(loadUserHoldings);

  useEffect(() => {
    const refresh = () => setHoldings(loadUserHoldings());
    window.addEventListener(PORTFOLIO_HOLDINGS_UPDATED_EVENT, refresh);
    window.addEventListener('portfolio-updated', refresh);
    return () => {
      window.removeEventListener(PORTFOLIO_HOLDINGS_UPDATED_EVENT, refresh);
      window.removeEventListener('portfolio-updated', refresh);
    };
  }, []);

  const updateHoldings = useCallback((next: UserHoldings) => {
    saveUserHoldings(next);
    setHoldings(next);
  }, []);

  return { holdings, setHoldings: updateHoldings, refresh: () => setHoldings(loadUserHoldings()) };
}
