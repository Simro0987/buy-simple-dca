import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Layers,
  Activity,
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  GitBranch,
  Download,
  Scale,
  Database,
  Cpu,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import {
  FOUR_SAFE_VAULTS,
  loadInstitutional15Agents,
  subscribeInstitutional15Agents,
  updateInstitutionalAgentTokenPct,
  addTokenToInstitutionalAgent,
  removeTokenFromInstitutionalAgent,
  STRATEGY_SCHEDULER_PRIORITY,
  TRADING_STYLES_LIBRARY,
  UNIVERSAL_MARKETS_REGISTRY,
  CONSOLIDATED_AUDIT_MATRIX,
  INFRASTRUCTURE_DEPENDENCY_MAP,
  evaluateBtcEthPairCrossMarginRisk,
  evaluateTradeThroughInstitutionalCommittee,
  generateInvestorTreasuryReport,
  type SystemExecutionMode,
  type DataQualityState,
  type MarketRegimeState,
  type InvestorReportPeriod,
  type EvidencePackageRecord,
  type SpecializedInstitutionalAgent,
} from '@/lib/institutionalOsEngine';

interface Props {
  lang: Lang;
}

export function InstitutionalOsCenter({ lang }: Props) {
  const sk = lang === 'sk';
  const { safeSession } = useAuth();
  const isSafeConnected = Boolean(safeSession?.safeAddress);

  const [osSection, setOsSection] = useState<
    | 'committee'
    | 'vaults_guard'
    | 'styles_pair'
    | 'universal_markets'
    | 'reports'
    | 'spec_audit'
  >('committee');

  const [executionMode, setExecutionMode] = useState<SystemExecutionMode>('PAPER');
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [dataQuality, setDataQuality] = useState<DataQualityState>('HEALTHY');
  const [marketRegime, setMarketRegime] = useState<MarketRegimeState>('BULL_TREND');

  const [marketSearch, setMarketSearch] = useState('');
  const [reportPeriod, setReportPeriod] = useState<InvestorReportPeriod>('WEEKLY');
  const [instAgents, setInstAgents] = useState<SpecializedInstitutionalAgent[]>(() =>
    loadInstitutional15Agents(),
  );
  const [newTokenByAgent, setNewTokenByAgent] = useState<Record<string, string>>({});

  useEffect(() => {
    return subscribeInstitutional15Agents(() => {
      setInstAgents(loadInstitutional15Agents());
    });
  }, []);

  // Evidence package interactive simulator state
  const [evidenceLogs, setEvidenceLogs] = useState<EvidencePackageRecord[]>(() => [
    evaluateTradeThroughInstitutionalCommittee({
      executionMode: 'PAPER',
      killSwitchActive: false,
      dataQuality: 'HEALTHY',
      marketRegime: 'BULL_TREND',
      strategyId: 'style-long-term-core-dca',
      modelVersionId: 'safebtc-model-v2.4.0-paper',
      chain: 'arbitrum',
      tokenIn: 'USDC',
      tokenOut: 'BTC',
      amountUsd: 180,
      oraclePriceUsd: 75020,
      dexQuotePriceUsd: 75065,
      liquidityUsd: 14_500_000,
      recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      strategySafeAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    }),
  ]);

  const pairAnalysis = useMemo(() => evaluateBtcEthPairCrossMarginRisk(75000, 2150, 200), []);
  const activeReport = useMemo(
    () => generateInvestorTreasuryReport(reportPeriod, isSafeConnected, 1023.24),
    [reportPeriod, isSafeConnected],
  );

  const filteredUniversalMarkets = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    if (!q) return UNIVERSAL_MARKETS_REGISTRY;
    return UNIVERSAL_MARKETS_REGISTRY.filter(
      (item) =>
        item.symbolOrName.toLowerCase().includes(q) ||
        item.chain.toLowerCase().includes(q) ||
        item.kind.toLowerCase().includes(q) ||
        item.stage.toLowerCase().includes(q),
    );
  }, [marketSearch]);

  const handleToggleKillSwitch = () => {
    const nextKill = !killSwitchActive;
    setKillSwitchActive(nextKill);
    setExecutionMode(nextKill ? 'KILL' : 'PAPER');
    if (nextKill) {
      toast.error(
        sk
          ? 'GLOBÁLNY KILL SWITCH AKTIVOVANÝ! Všetky nové návrhy transakcií a automatizácie sú okamžite zastavené (Fail-Closed).'
          : 'GLOBAL KILL SWITCH ACTIVATED! All new transaction proposals stopped immediately.',
      );
    } else {
      toast.success(
        sk
          ? 'Systém obnovený do bezpečného predvoleného režimu PAPER.'
          : 'System restored to safe default PAPER mode.',
      );
    }
  };

  const handleSimulateCommitteeDecision = (testFailClosedVeto: boolean) => {
    const safeAddr =
      safeSession?.safeAddress ?? '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    const record = evaluateTradeThroughInstitutionalCommittee({
      executionMode,
      killSwitchActive,
      dataQuality: testFailClosedVeto ? 'CONFLICT' : dataQuality,
      marketRegime,
      strategyId: 'style-long-term-core-dca',
      modelVersionId: 'safebtc-model-v2.4.0-paper',
      chain: 'arbitrum',
      tokenIn: 'USDC',
      tokenOut: 'BTC',
      amountUsd: testFailClosedVeto ? 950 : 150,
      oraclePriceUsd: 75000,
      dexQuotePriceUsd: testFailClosedVeto ? 77200 : 75045,
      liquidityUsd: testFailClosedVeto ? 40_000 : 12_000_000,
      recipientAddress: testFailClosedVeto
        ? '0xDeadBeef00000000000000000000000000009999'
        : safeAddr,
      strategySafeAddress: safeAddr,
    });
    setEvidenceLogs((prev) => [record, ...prev.slice(0, 14)]);
    if (record.finalVerdict === 'VETOED_NO_TRADE') {
      toast.error(record.vetoReasonSk ?? 'Obchod zamietnutý výborom agentov (NO TRADE).');
    } else {
      toast.success(
        `Evidence Package (${record.merkleLeafHash.slice(0, 12)}…) schválený výborom v režime ${record.executionMode}!`,
      );
    }
  };

  const handleDownloadReportJson = () => {
    const blob = new Blob([JSON.stringify(activeReport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safebtc-investor-report-${activeReport.period.toLowerCase()}-${activeReport.generatedAtIso.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      sk
        ? `Report (${activeReport.period}) s on-chain Merkle hashom exportovaný!`
        : `Report (${activeReport.period}) exported!`,
    );
  };

  return (
    <div className="space-y-4">
      {/* TOP GLOBAL INSTITUTIONAL CONTROL BAR: EXECUTION MODE, DATA QUALITY, MARKET REGIME & KILL SWITCH */}
      <div className="rounded-2xl border border-[#14F195]/40 bg-[#14F195]/[0.04] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="w-5 h-5 text-[#14F195]" />
              <h2 className="text-sm font-bold text-foreground">
                SafeBTC Institutional DeFi Operating System · Command Center
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  killSwitchActive
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                    : 'bg-[#14F195]/20 text-[#14F195] border-[#14F195]/40'
                }`}
              >
                REŽIM: {killSwitchActive ? 'KILL SWITCH ACTIVE' : executionMode}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {sk
                ? '3 vrstvy oprávnení (Immutable SafeBTCGuard.sol → 15 AI Agentov s právom VETA → Jediná Execution Queue). Predvolený režim je PAPER. Žiadny agent nikdy nedrží seed ani private key.'
                : '3 permission layers (Immutable SafeBTCGuard.sol -> 15 AI Agents with Veto -> Single Execution Queue). Default mode is PAPER.'}
            </p>
          </div>

          {/* BIG EMERGENCY KILL SWITCH BUTTON */}
          <button
            type="button"
            onClick={handleToggleKillSwitch}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 shadow ${
              killSwitchActive
                ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                : 'bg-rose-600 text-white hover:bg-rose-500 border border-rose-400/50'
            }`}
          >
            <AlertOctagon className="w-4 h-4" />
            {killSwitchActive
              ? sk
                ? 'Obnoviť do PAPER režimu'
                : 'Restore to PAPER Mode'
              : sk
                ? 'KILL SWITCH (Zastaviť všetko)'
                : 'KILL SWITCH (Stop All)'}
          </button>
        </div>

        {/* Mode, Data Quality Gate & Market Regime Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <div className="rounded-xl bg-black/50 border border-white/10 p-2.5 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold block">
              1. Prepínač Režimu (PAPER = Default)
            </span>
            <div className="flex flex-wrap gap-1">
              {(['PAPER', 'SHADOW', 'TESTNET', 'PAUSE'] as SystemExecutionMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setKillSwitchActive(false);
                    setExecutionMode(m);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    executionMode === m && !killSwitchActive
                      ? 'bg-[#14F195] text-black border-[#14F195]'
                      : 'bg-secondary/60 text-muted-foreground border-border'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-black/50 border border-white/10 p-2.5 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold block">
              2. Data Quality Gate (Iba HEALTHY obchoduje)
            </span>
            <div className="flex flex-wrap gap-1">
              {(['HEALTHY', 'DEGRADED', 'STALE', 'CONFLICT', 'OUTAGE'] as DataQualityState[]).map(
                (dq) => (
                  <button
                    key={dq}
                    type="button"
                    onClick={() => setDataQuality(dq)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                      dataQuality === dq
                        ? dq === 'HEALTHY'
                          ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                        : 'bg-secondary/60 text-muted-foreground border-border'
                    }`}
                  >
                    {dq}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="rounded-xl bg-black/50 border border-white/10 p-2.5 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold block">
              3. Market Regime Controller
            </span>
            <select
              value={marketRegime}
              onChange={(e) => setMarketRegime(e.target.value as MarketRegimeState)}
              className="w-full rounded-lg bg-secondary text-foreground text-[11px] font-mono px-2 py-1 border border-border"
            >
              <option value="BULL_TREND">BULL_TREND (Povolené DCA + Trend)</option>
              <option value="RANGE">RANGE (Povolené DCA + Mean-Reversion)</option>
              <option value="BEAR_TREND">BEAR_TREND (Konzervatívne DCA + De-Risk)</option>
              <option value="HIGH_VOLATILITY">HIGH_VOLATILITY (Znížený Risk Budget, 0x Páka)</option>
              <option value="LIQUIDITY_STRESS">LIQUIDITY_STRESS (PAUSE — iba Deleverage)</option>
              <option value="STABLECOIN_DEPEG">STABLECOIN_DEPEG (Zákaz stable expozície)</option>
              <option value="DATA_CONFLICT">DATA_CONFLICT (Fail-Closed NO TRADE)</option>
              <option value="PROTOCOL_INCIDENT">PROTOCOL_INCIDENT (Karanténa protokolu)</option>
            </select>
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION FOR THE 6 INSTITUTIONAL OS MODULES */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 p-1 rounded-xl bg-secondary/80 border border-border">
        {[
          { id: 'committee' as const, label: '15 Agentov & Veto' },
          { id: 'vaults_guard' as const, label: '4 Trezory & Guard' },
          { id: 'styles_pair' as const, label: 'Štýly & BTC/ETH Pair' },
          { id: 'universal_markets' as const, label: 'Universal Explorer' },
          { id: 'reports' as const, label: 'Investor Reporty' },
          { id: 'spec_audit' as const, label: 'Audit & Architektúra' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setOsSection(tab.id)}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all ${
              osSection === tab.id
                ? 'bg-[#14F195] text-black shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: 15 SPECIALIZED AGENTS, VETO PIPELINE, EVIDENCE PACKAGES & SELF-IMPROVING CORE */}
      {osSection === 'committee' && (
        <div className="space-y-4">
          {/* Mandatory Decision Pipeline Simulator */}
          <div className="glass-card p-4 space-y-3 border border-[#14F195]/30">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Povinný Rozhodovací Reťazec s Právom VETA &amp; Evidence Package (Merkle Audit)
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Data Quality (Veto) → Market Research → Strategy → Risk &amp; Security (Najvyššie Veto) → Simulation (Veto) → Jediná Execution Queue → SafeBTCGuard.sol
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSimulateCommitteeDecision(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#14F195] text-black text-xs font-bold"
                >
                  Otestovať Schválenie (PAPER)
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateCommitteeDecision(true)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold"
                >
                  Otestovať Fail-Closed VETO
                </button>
              </div>
            </div>

            {/* Latest Evidence Package */}
            {evidenceLogs.slice(0, 3).map((ev) => (
              <div
                key={ev.id}
                className={`rounded-xl p-3 border text-xs space-y-1.5 ${
                  ev.finalVerdict === 'VETOED_NO_TRADE'
                    ? 'bg-rose-500/[0.07] border-rose-500/40'
                    : 'bg-emerald-500/[0.06] border-emerald-500/35'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    {ev.finalVerdict === 'VETOED_NO_TRADE' ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {ev.finalVerdict} · {ev.tokenIn} → {ev.tokenOut} (${ev.amountUsd})
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Model: {ev.modelVersionId} · Merkle: {ev.merkleLeafHash.slice(0, 14)}…
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono">
                  <span>DataQuality: {ev.committeeVotes.dataQualityAgent}</span>
                  <span>Strategy: {ev.committeeVotes.strategyAgent}</span>
                  <span>Risk/Security: {ev.committeeVotes.riskSecurityAgent}</span>
                  <span>Simulation: {ev.committeeVotes.simulationAgent}</span>
                </div>

                {ev.vetoReasonSk ? (
                  <p className="text-[11px] font-semibold text-rose-300">{ev.vetoReasonSk}</p>
                ) : (
                  <p className="text-[10px] text-emerald-300 font-mono">
                    Oracle: ${ev.oraclePriceUsd} · DEX Quote: ${ev.dexQuotePriceUsd} (odchýlka {ev.oracleDexDeviationPct}%) · Min Receive: {ev.minReceiveAfterSlippage}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* All 15 Specialized Agents Capability Matrix + Unified Swarm P2P Learning & Token % Controls */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Jednotná Sieť 15 Inštitucionálnych Agentov (P2P Samo-Učenie, Zmena % Váhy, Pridávanie &amp; Odoberanie Tokenov)
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Všetci agenti sú navzájom prepojení do jednej neurónovej siete (20 uzlov spolu s obchodnou flotilou), automaticky sa učia a pri každom tokene môžeš meniť % alokáciu, pridávať nové tokeny alebo ich odoberať.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#14F195]/20 text-[#14F195] text-[10px] font-mono font-bold">
                20/20 UZLOV PREPOJENÝCH V SIETI
              </span>
            </div>

            <div className="space-y-2.5">
              {instAgents.map((ag) => (
                <div
                  key={ag.id}
                  className="rounded-xl bg-secondary/40 border border-border/70 p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{ag.name}</span>
                      {ag.hasVetoPower && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-mono font-bold">
                          PRÁVO VETA
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-black/40 text-sky-300 text-[9px] font-mono">
                        {ag.layer}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-[#14F195]/15 text-[#14F195] font-bold">
                        IQ {(ag.collectiveIqScore ?? 142.5).toFixed(1)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-black/50 text-foreground">
                        {ag.swarmSynapsesCount ?? 54} synapsií
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                        {ag.lifecycleStatus}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                    <div>
                      <strong className="text-foreground/80">Číta / Navrhuje:</strong> {ag.canRead} → {ag.canPropose}
                    </div>
                    <div>
                      <strong className="text-rose-300/90">Zakázané:</strong> {ag.forbidden}
                    </div>
                  </div>

                  {/* Interactive Token Allocation % & Add/Remove per Agent */}
                  <div className="rounded-lg bg-black/40 border border-white/[0.06] p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-muted-foreground uppercase">
                        Spravované tokeny &amp; Dynamické % rozdelenie (Súčet = 100% · Max 45% na altcoin):
                      </span>
                      <span className="font-mono text-[#14F195]">
                        Prepojené s {ag.connectedMeshNodesCount ?? 20} agentmi
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(ag.managedTokens ?? []).map((tok) => (
                        <div
                          key={`${ag.id}-${tok.symbol}`}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/80 border border-border text-[11px] font-mono"
                        >
                          <span className="font-bold text-foreground">{tok.symbol}</span>
                          <span className="text-[9px] text-muted-foreground uppercase">{tok.chain}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setInstAgents(
                                updateInstitutionalAgentTokenPct(ag.id, tok.symbol, tok.weightPct - 5),
                              )
                            }
                            className="px-1 rounded bg-black/50 hover:bg-black text-muted-foreground hover:text-foreground text-[10px] font-bold"
                            title="Znížiť % o 5%"
                          >
                            −
                          </button>
                          <span className="text-[#14F195] font-bold">{tok.weightPct}%</span>
                          <button
                            type="button"
                            onClick={() =>
                              setInstAgents(
                                updateInstitutionalAgentTokenPct(ag.id, tok.symbol, tok.weightPct + 5),
                              )
                            }
                            className="px-1 rounded bg-black/50 hover:bg-black text-muted-foreground hover:text-foreground text-[10px] font-bold"
                            title="Zvýšiť % o 5%"
                          >
                            +
                          </button>
                          {tok.symbol !== 'BTC' && (
                            <button
                              type="button"
                              onClick={() => {
                                setInstAgents(removeTokenFromInstitutionalAgent(ag.id, tok.symbol));
                                toast.info(`Token ${tok.symbol} odobraný z agenta ${ag.name.split('.')[1]?.trim() ?? ag.name}.`);
                              }}
                              className="text-muted-foreground hover:text-rose-400 font-bold ml-0.5"
                              title="Odobrať token a presunúť % do BTC"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <input
                        type="text"
                        value={newTokenByAgent[ag.id] ?? ''}
                        onChange={(e) =>
                          setNewTokenByAgent((prev) => ({ ...prev, [ag.id]: e.target.value }))
                        }
                        placeholder="Pridať token (napr. PENDLE, TAO, INJ, TIA, HYPE, AR, FIL, AKT, PYTH)…"
                        className="flex-1 px-2.5 py-1 rounded-md bg-secondary text-foreground text-[11px] font-mono border border-border focus:outline-none focus:border-[#14F195]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const sym = (newTokenByAgent[ag.id] ?? '').trim().toUpperCase();
                          if (!sym) return;
                          setInstAgents(addTokenToInstitutionalAgent(ag.id, sym, 'arbitrum', 12));
                          setNewTokenByAgent((prev) => ({ ...prev, [ag.id]: '' }));
                          toast.success(`Token ${sym} (12%) pridaný a zosynchronizovaný v sieti agentov!`);
                        }}
                        className="px-2.5 py-1 rounded-md bg-[#14F195]/20 hover:bg-[#14F195] text-[#14F195] hover:text-black text-[10px] font-bold border border-[#14F195]/40 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Pridať token
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] font-mono text-[#14F195]">
                    Posledný stav v sieti: {ag.lastDecisionSk}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: 4 SEGREGATED SAFE VAULTS, STRATEGY SCHEDULER & SOLIDITY SAFEBTCGUARD.SOL */}
      {osSection === 'vaults_guard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FOUR_SAFE_VAULTS.map((v) => (
              <div
                key={v.id}
                className="glass-card p-3.5 space-y-2 border border-white/[0.08]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#14F195]" />
                    {v.nameSk}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#14F195]/15 text-[#14F195] text-[10px] font-mono font-bold">
                    {v.allocatedPctOfCapital}% kapitálu
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{v.roleSk}</p>
                <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-border/50">
                  <span className="text-emerald-300">Prístup: {v.agentAccess}</span>
                  <span className="text-foreground">
                    Denný Risk Budget: ${v.dailyRiskBudgetUsd}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card p-4 space-y-2.5 border border-amber-500/30">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Strategy Scheduler · Hierarchia Priorít (Vyššia priorita okamžite pozastaví nižšiu)
            </h3>
            <div className="space-y-1">
              {STRATEGY_SCHEDULER_PRIORITY.map((item) => (
                <div
                  key={item}
                  className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.06] text-[11px] font-mono text-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: 8 TRADING STYLES / TIMEFRAMES & BTC/ETH PAIR TRADING CROSS-MARGIN ENGINE */}
      {osSection === 'styles_pair' && (
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Štýly Obchodovania podľa Časového Horizontu (Oddelené učenie &amp; Netto P/L po všetkých nákladoch)
            </h3>
            <div className="space-y-2">
              {TRADING_STYLES_LIBRARY.map((st) => (
                <div
                  key={st.strategyId}
                  className="rounded-xl bg-secondary/40 border border-border p-3 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-foreground">
                      {st.nameSk} <span className="text-muted-foreground font-mono">({st.timeframe})</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-black/50 text-[10px] font-mono text-sky-300">
                        Cieľ: {st.targetAllocationPct}%
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          st.status === 'PAPER'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : st.status === 'SHADOW'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {st.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-emerald-300">
                    Netto P/L (PAPER): {st.netPnlAfterCostsPct >= 0 ? '+' : ''}
                    {st.netPnlAfterCostsPct}% · {st.costsBreakdownSk}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{st.noTradeConditionSk}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Relative-Value BTC/ETH Pair Trading & Cross-Margin Liquidation Risk Engine */}
          <div className="glass-card p-4 space-y-3 border border-sky-500/35">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Relative-Value BTC/ETH Pair Trading &amp; Cross-Margin Liquidation Risk Engine
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-mono">
                Cross-Margin: VYPNUTÝ · Izolovaná marža (SHADOW/PAPER)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                <span className="text-[10px] text-muted-foreground block">ETH/BTC Pomer</span>
                <span className="font-bold text-foreground">{pairAnalysis.ethBtcRatio}</span>
              </div>
              <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                <span className="text-[10px] text-muted-foreground block">30d Korelácia</span>
                <span className="font-bold text-emerald-400">{pairAnalysis.rollingCorrelation30d}</span>
              </div>
              <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                <span className="text-[10px] text-muted-foreground block">Spread Z-Score</span>
                <span className="font-bold text-amber-300">{pairAnalysis.spreadZScore}</span>
              </div>
              <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                <span className="text-[10px] text-muted-foreground block">Deleverage Trigger</span>
                <span className="font-bold text-rose-300">≤ {pairAnalysis.deleverageTriggerDistancePct}% Liq odstup</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {pairAnalysis.scenarios.map((sc) => (
                <div
                  key={sc.scenarioNameSk}
                  className="rounded-lg bg-secondary/50 border border-border/60 p-2.5 text-[11px] flex items-center justify-between gap-2 flex-wrap"
                >
                  <div>
                    <span className="font-bold text-foreground block">{sc.scenarioNameSk}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Voľný kolaterál: {sc.remainingCollateralBufferPct}% · Liq odstup: {sc.liquidationDistancePct}%
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-black/50 text-[10px] font-mono font-bold text-[#14F195]">
                    {sc.actionTriggered}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{pairAnalysis.verdictSk}</p>
          </div>
        </div>
      )}

      {/* SECTION 4: UNIVERSAL MARKETS EXPLORER (DYNAMIC QUALIFICATION PIPELINE) */}
      {osSection === 'universal_markets' && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Universal Asset &amp; Protocol Registry (Dynamická Bezpečnostná Kvalifikácia)
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Všetky chainy, tokeny, DEX-y, lending protokoly a RWA môžu byť objavené a testované v SHADOW/PAPER. Do LIMITED_LIVE postúpia len po splnení Data Quality, Risk, Simulation a Safe multisig schválenia.
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              placeholder="Hľadať token, chain, DEX, lending protokol alebo RWA (napr. BTC, CowSwap, Kamino, MSTR)…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-foreground text-xs border border-border focus:outline-none focus:border-[#14F195]"
            />
          </div>

          <div className="space-y-2">
            {filteredUniversalMarkets.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-secondary/40 border border-border p-3 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{item.symbolOrName}</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-muted-foreground">
                      {item.kind} · {item.chain}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="text-emerald-300">Risk Score: {item.riskScore}/100</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        item.stage === 'BLOCKED'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-[#14F195]/20 text-[#14F195]'
                      }`}
                    >
                      {item.stage}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">{item.whyNotLiveSk}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5: INVESTOR & TREASURY REPORTING CENTER (WEEKLY / MONTHLY / QUARTERLY / ANNUAL) */}
      {osSection === 'reports' && (
        <div className="glass-card p-4 space-y-3 border border-[#14F195]/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#14F195]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Investor &amp; Treasury Reporting Center (Týždenné, Mesačné, Štvrťročné, Ročné)
              </h3>
            </div>
            <button
              type="button"
              onClick={handleDownloadReportJson}
              className="px-3 py-1.5 rounded-lg bg-[#14F195] text-black text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Exportovať Report + Merkle Manifest (JSON)
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as InvestorReportPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setReportPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  reportPeriod === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {p === 'WEEKLY' && 'Týždenný'}
                {p === 'MONTHLY' && 'Mesačný'}
                {p === 'QUARTERLY' && 'Štvrťročný'}
                {p === 'ANNUAL' && 'Ročný (Investor Letter)'}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-black/50 border border-white/10 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-foreground">{activeReport.titleSk}</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                {activeReport.completenessStatus} · {activeReport.auditStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div className="rounded-lg bg-secondary/50 p-2">
                <span className="text-[9px] text-muted-foreground block">PAPER NAV (Simulácia)</span>
                <span className="font-bold text-foreground">${activeReport.paperNavUsd.toFixed(2)}</span>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <span className="text-[9px] text-muted-foreground block">PAPER Netto P/L (Po nákladoch)</span>
                <span className="font-bold text-emerald-400">
                  +${activeReport.paperNetPnlAfterCostsUsd.toFixed(2)} (náklady ${activeReport.paperTotalCostsUsd})
                </span>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <span className="text-[9px] text-muted-foreground block">LIVE Safe Zostatok (Oddelené)</span>
                <span className="font-bold text-amber-300">
                  {activeReport.liveSafeConnected ? `${activeReport.liveBtcBalance.toFixed(6)} BTC` : '0.000000 BTC (Nepripojené)'}
                </span>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <span className="text-[9px] text-muted-foreground block">Max Drawdown (PAPER)</span>
                <span className="font-bold text-foreground">{activeReport.paperMaxDrawdownPct}%</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">{activeReport.stressTestsSummarySk}</p>
            <p className="text-[11px] text-emerald-300 font-mono">
              {activeReport.incidentsAndBlocksSummarySk}
            </p>
            <p className="text-[10px] font-mono text-sky-300 break-all">
              On-Chain Merkle Root Dôkazu: {activeReport.merkleRootOnChainHash}
            </p>
            <p className="text-[10px] text-amber-200/80 border-t border-white/10 pt-2">
              {activeReport.disclaimerSk}
            </p>
          </div>
        </div>
      )}

      {/* SECTION 6: CONSOLIDATED AUDIT MATRIX & INFRASTRUCTURE DEPENDENCY MAP */}
      {osSection === 'spec_audit' && (
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              A) Konsolidovaná Auditná Matica Súborov &amp; Modulov (Single Source of Truth)
            </h3>
            <div className="space-y-1.5">
              {CONSOLIDATED_AUDIT_MATRIX.map((row) => (
                <div
                  key={row.moduleOrFile}
                  className="rounded-lg bg-secondary/40 border border-border p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-bold text-[#14F195]">{row.moduleOrFile}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">({row.sourceProject})</span>
                    <p className="text-[11px] text-muted-foreground">{row.purposeSk}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold shrink-0">
                    {row.action} · {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              B) Infrastructure Dependency Map (Čo je Decentralizované vs. Fallback pri výpadku)
            </h3>
            <div className="space-y-1.5">
              {INFRASTRUCTURE_DEPENDENCY_MAP.map((dep) => (
                <div
                  key={dep.component}
                  className="rounded-lg bg-secondary/40 border border-border p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-foreground">{dep.component}</span>
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono">
                      {dep.decentralizationLevel} · {dep.holdsKeysOrSeeds}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    <strong>Primárny:</strong> {dep.primaryProvider} | <strong>Záložný:</strong> {dep.fallbackProvider}
                  </p>
                  <p className="text-[10px] text-emerald-300">{dep.onOutageBehaviorSk}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
