import { create } from "zustand";
import type { LiveAsset } from "@/hooks/usePortfolio";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { DEFAULT_WEEKLY_INVESTMENT } from "@/lib/dcaEngineConfig";
import type { NewsArticle } from "@/lib/newsEngine";
import type { TradingMode } from "@/lib/exchange/types";
import type { MasterDcaResult } from "@/lib/masterDcaEngine";
import {
  DEFAULT_API_STATUS,
  type ApiSourceHealth,
  type ApiStatusState,
} from "@/lib/price/types";
import {
  applyPortfolioLaunchReset,
  createDefaultPortfolio,
  writePortfolioToStorage,
  type PortfolioData,
} from "@/lib/portfolioStorage";
import { readTradingMode, writeTradingMode } from "@/lib/tradeHistory";

export type NewsFeedMode = "portfolio" | "all";

export interface DcaPlanState {
  weeklyBudget: number;
  executionPlans: TokenExecutionPlan[];
  result: MasterDcaResult | null;
  lastUpdated: string | null;
}

export interface NewsFeedState {
  mode: NewsFeedMode;
  selectedToken: string | null;
  articles: NewsArticle[];
  heroArticleId: string | null;
  flashArticleId: string | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

interface AppStore {
  portfolioData: PortfolioData;
  portfolioAssets: LiveAsset[];
  isPortfolioHydrated: boolean;

  dcaPlan: DcaPlanState;
  newsFeed: NewsFeedState;
  apiStatus: ApiStatusState;
  tradingMode: TradingMode;

  hydratePortfolio: () => void;
  setPortfolioData: (
    data: PortfolioData | ((prev: PortfolioData) => PortfolioData),
  ) => void;
  setPortfolioAssets: (assets: LiveAsset[]) => void;

  setWeeklyBudget: (amount: number) => void;
  setDcaPlan: (payload: Partial<DcaPlanState>) => void;
  setExecutionPlans: (plans: TokenExecutionPlan[]) => void;
  setDcaResult: (result: MasterDcaResult | null) => void;

  setNewsMode: (mode: NewsFeedMode) => void;
  setSelectedToken: (token: string | null) => void;
  setNewsArticles: (payload: {
    articles: NewsArticle[];
    heroArticleId?: string | null;
    flashArticleId?: string | null;
    fetchedAt?: string;
  }) => void;
  setNewsLoading: (loading: boolean) => void;
  setNewsError: (error: string | null) => void;

  setApiStatus: (key: keyof ApiStatusState, status: ApiSourceHealth) => void;
  setTradingMode: (mode: TradingMode) => void;
  hydrateTradingMode: () => void;
}

const defaultNewsFeed: NewsFeedState = {
  mode: "portfolio",
  selectedToken: null,
  articles: [],
  heroArticleId: null,
  flashArticleId: null,
  loading: true,
  error: null,
  lastUpdated: null,
};

const defaultDcaPlan: DcaPlanState = {
  weeklyBudget: DEFAULT_WEEKLY_INVESTMENT,
  executionPlans: [],
  result: null,
  lastUpdated: null,
};

export const useAppStore = create<AppStore>((set, get) => ({
  portfolioData: createDefaultPortfolio(),
  portfolioAssets: [],
  isPortfolioHydrated: false,
  dcaPlan: defaultDcaPlan,
  newsFeed: defaultNewsFeed,
  apiStatus: DEFAULT_API_STATUS,
  tradingMode: "simulation",

  hydratePortfolio: () => {
    if (get().isPortfolioHydrated) return;
    const data = applyPortfolioLaunchReset();
    set({ portfolioData: data, isPortfolioHydrated: true });
  },

  setPortfolioData: (dataOrUpdater) => {
    const next =
      typeof dataOrUpdater === "function"
        ? dataOrUpdater(get().portfolioData)
        : dataOrUpdater;
    writePortfolioToStorage(next);
    set({ portfolioData: next });
  },

  setPortfolioAssets: (assets) => {
    set({ portfolioAssets: assets });
  },

  setWeeklyBudget: (amount) => {
    set((state) => ({
      dcaPlan: {
        ...state.dcaPlan,
        weeklyBudget: Math.max(0, amount),
      },
    }));
  },

  setDcaPlan: (payload) => {
    set((state) => ({
      dcaPlan: {
        ...state.dcaPlan,
        ...payload,
        lastUpdated: payload.lastUpdated ?? new Date().toISOString(),
      },
    }));
  },

  setExecutionPlans: (plans) => {
    set((state) => ({
      dcaPlan: {
        ...state.dcaPlan,
        executionPlans: plans,
        lastUpdated: new Date().toISOString(),
      },
    }));
  },

  setDcaResult: (result) => {
    set((state) => ({
      dcaPlan: {
        ...state.dcaPlan,
        result,
        lastUpdated: new Date().toISOString(),
      },
    }));
  },

  setNewsMode: (mode) => {
    set((state) => ({
      newsFeed: { ...state.newsFeed, mode },
    }));
  },

  setSelectedToken: (token) => {
    set((state) => ({
      newsFeed: { ...state.newsFeed, selectedToken: token },
    }));
  },

  setNewsArticles: ({
    articles,
    heroArticleId = null,
    flashArticleId = null,
    fetchedAt,
  }) => {
    set((state) => ({
      newsFeed: {
        ...state.newsFeed,
        articles,
        heroArticleId,
        flashArticleId,
        lastUpdated: fetchedAt ?? new Date().toISOString(),
        loading: false,
        error: null,
      },
    }));
  },

  setNewsLoading: (loading) => {
    set((state) => ({
      newsFeed: { ...state.newsFeed, loading },
    }));
  },

  setNewsError: (error) => {
    set((state) => ({
      newsFeed: {
        ...state.newsFeed,
        error,
        loading: false,
      },
    }));
  },

  setApiStatus: (key, status) => {
    set((state) => ({
      apiStatus: {
        ...state.apiStatus,
        [key]: status,
      },
    }));
  },

  setTradingMode: (mode) => {
    writeTradingMode(mode);
    set({ tradingMode: mode });
  },

  hydrateTradingMode: () => {
    set({ tradingMode: readTradingMode() });
  },
}));

export function usePortfolioAssets() {
  return useAppStore((state) => state.portfolioAssets);
}

export function useDcaPlan() {
  return useAppStore((state) => state.dcaPlan);
}

export function useNewsFeedState() {
  return useAppStore((state) => state.newsFeed);
}

export function useApiStatus() {
  return useAppStore((state) => state.apiStatus);
}

export function useTradingMode() {
  return useAppStore((state) => state.tradingMode);
}
