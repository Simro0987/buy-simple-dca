"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  readPrivacyModeFromStorage,
  writePrivacyModeToStorage,
} from "@/lib/privacyStorage";

interface PrivacyContextValue {
  isPrivacyMode: boolean;
  isHydrated: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (enabled: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsPrivacyMode(readPrivacyModeFromStorage());
    setIsHydrated(true);
  }, []);

  const setPrivacyMode = useCallback((enabled: boolean) => {
    setIsPrivacyMode(enabled);
    writePrivacyModeToStorage(enabled);
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode(!isPrivacyMode);
  }, [isPrivacyMode, setPrivacyMode]);

  const value = useMemo(
    () => ({
      isPrivacyMode,
      isHydrated,
      togglePrivacyMode,
      setPrivacyMode,
    }),
    [isPrivacyMode, isHydrated, togglePrivacyMode, setPrivacyMode],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error("usePrivacy must be used within PrivacyProvider");
  }
  return context;
}
