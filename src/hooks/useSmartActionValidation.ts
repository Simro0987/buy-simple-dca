import { useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useStablesByNetwork } from '@/hooks/useStablesByNetwork';
import { ensurePortfolioData } from '@/lib/portfolioData';
import { validateActionBalance, type SmartValidationResult } from '@/lib/smartActionValidation';

export function useSmartActionValidation(
  tokenSymbol: string,
  requiredAmount: number,
  options?: { skip?: boolean; usdAmount?: number },
): SmartValidationResult {
  const { portfolioData } = usePortfolio();
  const stables = useStablesByNetwork();

  return useMemo(
    () => validateActionBalance({
      portfolio: ensurePortfolioData(portfolioData),
      stables,
      tokenSymbol,
      requiredAmount,
      usdAmount: options?.usdAmount,
      skip: options?.skip,
    }),
    [portfolioData, stables, tokenSymbol, requiredAmount, options?.usdAmount, options?.skip],
  );
}
