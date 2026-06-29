import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChainFilterProvider } from "@/hooks/useChainFilter";
import { MarketProvider } from "@/contexts/MarketContext";
import { WalletProvider } from "@/contexts/WalletContext";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import CyborgTerminalPage from "./pages/CyborgTerminalPage.tsx";
import CryptoNewsFeedPremium from "./components/CryptoNewsFeedPremium.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WalletProvider>
      <ChainFilterProvider>
        <MarketProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/cyborg-terminal" element={<CyborgTerminalPage />} />
                <Route path="/news" element={<CryptoNewsFeedPremium />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </MarketProvider>
      </ChainFilterProvider>
    </WalletProvider>
  </QueryClientProvider>
);

export default App;
