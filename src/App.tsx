import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChainFilterProvider } from "@/hooks/useChainFilter";
import { MarketProvider } from "@/contexts/MarketContext";
import { WalletProvider } from "@/contexts/WalletContext";
import { AuthProvider } from "@/hooks/useAuth";
import { CloudSyncProvider } from "@/components/CloudSyncProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import CyborgTerminalPage from "./pages/CyborgTerminalPage.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { useEffect } from "react";
import { syncNow, SYNC_INTERVAL_MS } from "@/lib/dataSync";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000) } },
});

/** Fresh fetch on app load + every hour while open. */
function DataSyncController() {
  useEffect(() => {
    void syncNow(queryClient);
    const id = setInterval(() => void syncNow(queryClient), SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}

const App = () => (
  <AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <DataSyncController />
    <BrowserRouter>
      <AuthProvider>
        <CloudSyncProvider>
        <WalletProvider>
          <ChainFilterProvider>
            <MarketProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cyborg-terminal"
                    element={
                      <ProtectedRoute>
                        <CyborgTerminalPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </TooltipProvider>
            </MarketProvider>
          </ChainFilterProvider>
        </WalletProvider>
        </CloudSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
