import { create } from "zustand";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { DEFAULT_WEEKLY_INVESTMENT } from "@/lib/dcaEngineConfig";
import type { NewsArticle } from "@/lib/newsEngine";
import {
  applyPortfolioLaunchReset,
  createDefaultPortfolio,
  writePortfolioToStorage,
  type PortfolioData,
} from "@/lib/portfolioStorage";

export type NewsFeedMode = "portfolio" | "all";

export interface DcaSettings {
  weeklyBudget: number;
  executionPlans: TokenExecutionPlan[];
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
  isPortfolioHydrated: boolean;
  dcaSettings: DcaSettings;
  newsFeed: NewsFeedState;

  hydratePortfolio: () => void;
  setPortfolioData: (
    data: PortfolioData | ((prev: PortfolioData) => PortfolioData),
  ) => void;

  setWeeklyBudget: (amount: number) => void;
  setExecutionPlans: (plans: TokenExecutionPlan[]) => void;

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

export const useAppStore = create<AppStore>((set, get) => ({
  portfolioData: createDefaultPortfolio(),
  isPortfolioHydrated: false,
  dcaSettings: {
    weeklyBudget: DEFAULT_WEEKLY_INVESTMENT,
    executionPlans: [],
  },
  newsFeed: defaultNewsFeed,

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

  setWeeklyBudget: (amount) => {
    set((state) => ({
      dcaSettings: {
        ...state.dcaSettings,
        weeklyBudget: Math.max(0, amount),
      },
    }));
  },

  setExecutionPlans: (plans) => {
    set((state) => ({
      dcaSettings: {
        ...state.dcaSettings,
        executionPlans: plans,
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
}));

export function usePortfolioData() {
  return useAppStore((state) => state.portfolioData);
}

export function useDcaSettings() {
  return useAppStore((state) => state.dcaSettings);
}

export function useNewsFeedState() {
  return useAppStore((state) => state.newsFeed);
}
