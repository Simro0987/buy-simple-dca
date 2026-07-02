import { useCallback, useEffect, useState } from 'react';
import {
  loadUserHoldings,
  saveUserHoldings,
  normalizeUserHoldings,
  PORTFOLIO_HOLDINGS_UPDATED_EVENT,
  type UserHoldings,
} from '@/lib/portfolioRealHoldings';

export function useUserHoldings() {
  const [holdings, setHoldings] = useState<UserHoldings>(() => normalizeUserHoldings(loadUserHoldings()));

  useEffect(() => {
    const refresh = () => setHoldings(normalizeUserHoldings(loadUserHoldings()));
    window.addEventListener(PORTFOLIO_HOLDINGS_UPDATED_EVENT, refresh);
    window.addEventListener('portfolio-updated', refresh);
    return () => {
      window.removeEventListener(PORTFOLIO_HOLDINGS_UPDATED_EVENT, refresh);
      window.removeEventListener('portfolio-updated', refresh);
    };
  }, []);

  const updateHoldings = useCallback((next: UserHoldings) => {
    const safe = normalizeUserHoldings(next);
    saveUserHoldings(safe);
    setHoldings(safe);
  }, []);

  return { holdings, setHoldings: updateHoldings, refresh: () => setHoldings(loadUserHoldings()) };
}
