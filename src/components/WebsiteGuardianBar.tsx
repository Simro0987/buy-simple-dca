import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Sparkles, Cpu, Activity } from 'lucide-react';
import {
  loadWebsiteGuardianState,
  subscribeWebsiteGuardian,
  runAutonomousWebsiteGuardianScanAndPatch,
  applyLiveWebsiteUiVariables,
  UI_THEME_PRESETS,
  type WebsiteGuardianState,
} from '@/lib/websiteGuardianAgent';
import {
  runContinuousAutonomousFleetTick,
  loadAutonomousAgents,
  subscribeAutonomousAgents,
} from '@/lib/autonomousAgentEngine';
import { loadSafeSession } from '@/lib/safeWalletGuard';

/**
 * 24/7 Autonomous Background Daemon & Live Website Security Ribbon.
 * Runs 100% automatically on website boot and every few seconds in the background:
 *  - Continuously trains, evolves, and executes in-wallet trades across all AI Agents (`runContinuousAutonomousFleetTick`)
 *  - Scans DOM & storage for XSS/injection/tampering (`runAutonomousWebsiteGuardianScanAndPatch`)
 *  - Re-encrypts sensitive vault data with WebCrypto AES-256-GCM
 *  - Enforces `canWithdrawExternally = false` across all AI agents & Safe sessions
 *  - Applies live UI theme evolutions across the entire website
 */
export function WebsiteGuardianBar() {
  const [guardian, setGuardian] = useState<WebsiteGuardianState>(() =>
    loadWebsiteGuardianState(),
  );
  const [totalBtcStacked, setTotalBtcStacked] = useState<number>(() =>
    loadAutonomousAgents().reduce((s, a) => s + a.accumulatedBtc, 0),
  );
  const [totalGens, setTotalGens] = useState<number>(() =>
    loadAutonomousAgents().reduce((s, a) => s + a.learningGeneration, 0),
  );

  useEffect(() => {
    const current = loadWebsiteGuardianState();
    applyLiveWebsiteUiVariables(current.uiConfig);

    // Immediately run initial automatic security patch AND initial autonomous agent fleet learning/trading cycle on boot
    void runAutonomousWebsiteGuardianScanAndPatch();
    const safeAddr =
      loadSafeSession()?.safeAddress ?? '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    runContinuousAutonomousFleetTick(safeAddr, { BTC: 75000, ETH: 2150, SOL: 88 }, true);

    const syncAll = () => {
      setGuardian(loadWebsiteGuardianState());
      const ags = loadAutonomousAgents();
      setTotalBtcStacked(ags.reduce((s, a) => s + a.accumulatedBtc, 0));
      setTotalGens(ags.reduce((s, a) => s + a.learningGeneration, 0));
    };

    const unsubGuardian = subscribeWebsiteGuardian(syncAll);
    const unsubAgents = subscribeAutonomousAgents(syncAll);
    return () => {
      unsubGuardian();
      unsubAgents();
    };
  }, []);

  // Continuous 24/7 Self-Learning & In-Wallet Trading Loop (every 10 seconds automatically)
  useEffect(() => {
    const tradeLoop = window.setInterval(() => {
      const safeAddr =
        loadSafeSession()?.safeAddress ?? '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
      runContinuousAutonomousFleetTick(safeAddr, { BTC: 75000, ETH: 2150, SOL: 88 }, false);
    }, 10_000);

    const securityLoop = window.setInterval(() => {
      if (guardian.autopilotEnabled) {
        void runAutonomousWebsiteGuardianScanAndPatch();
      }
    }, Math.max(15, guardian.autopilotIntervalSeconds || 30) * 1000);

    return () => {
      window.clearInterval(tradeLoop);
      window.clearInterval(securityLoop);
    };
  }, [guardian.autopilotEnabled, guardian.autopilotIntervalSeconds]);

  const navigateToGuardianTab = () => {
    window.dispatchEvent(new CustomEvent('app-navigate-tab', { detail: 'agent' }));
    window.dispatchEvent(new CustomEvent('aegis-open-guardian-subtab'));
  };

  if (!guardian.uiConfig.showTopSecurityRibbon) return null;

  const activePreset = UI_THEME_PRESETS[guardian.uiConfig.themePreset] ?? UI_THEME_PRESETS.cyber_emerald;

  return (
    <div
      className="border-b border-white/[0.07] bg-black/80 backdrop-blur-md"
      style={{
        borderBottomColor: `${guardian.uiConfig.accentColorHex}33`,
      }}
    >
      <div className="max-w-lg mx-auto px-4 py-1.5 flex items-center justify-between gap-2 flex-wrap text-[10px]">
        <button
          type="button"
          onClick={navigateToGuardianTab}
          className="flex items-center gap-1.5 font-semibold text-left hover:opacity-90 transition-opacity"
          title="Otvoriť Aegis AI Website Guardian (Bezpečnosť, Šifrovanie, Záplaty & Dizajn)"
        >
          <ShieldCheck
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: guardian.uiConfig.accentColorHex }}
          />
          <span className="font-bold text-white">Aegis AI:</span>
          <span
            className="px-1.5 py-0.2 rounded font-mono font-bold"
            style={{
              backgroundColor: `${guardian.uiConfig.accentColorHex}20`,
              color: guardian.uiConfig.accentColorHex,
            }}
          >
            {guardian.securityScore}/100 SECURE
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-white/60 font-mono">
            · <Lock className="w-2.5 h-2.5 text-emerald-400" /> AES-256 · Swarm Mesh IQ {totalGens} · +{totalBtcStacked.toFixed(4)} ₿
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-semibold">
            <Activity className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
            <span>SWARM SIEŤ AGENTOV · SAMO-UČENIE &amp; OBCHODOVANIE</span>
          </span>

          <button
            type="button"
            onClick={navigateToGuardianTab}
            className="px-2 py-0.5 rounded-md font-bold flex items-center gap-1 text-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: activePreset.accentHex }}
          >
            <Cpu className="w-2.5 h-2.5" />
            <span>AI Strážca</span>
          </button>
        </div>
      </div>

      {/* Active Custom Modules Strip (added/managed by the Website Guardian AI) */}
      {guardian.uiConfig.activeCustomModules.some((m) => m.enabled) && (
        <div className="max-w-lg mx-auto px-4 pb-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {guardian.uiConfig.activeCustomModules
            .filter((m) => m.enabled)
            .map((mod) => (
              <div
                key={mod.id}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.07] text-[9px] shrink-0"
              >
                <Sparkles
                  className="w-2.5 h-2.5"
                  style={{ color: guardian.uiConfig.accentColorHex }}
                />
                <span className="text-white/60">{mod.titleSk}:</span>
                <span className="font-mono font-bold text-white/90">{mod.metricValue}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
