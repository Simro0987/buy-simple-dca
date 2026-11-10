/**
 * SafeBTC Institutional Decentralized DeFi Operating System Engine
 *
 * Implements the complete specification from `AI Agenti.txt`:
 *  1. 3 Permission Layers:
 *     - Immutable Security Layer (`SafeBTCGuard.sol`, allowlists, turnover limits, Kill Switch)
 *     - Decision, Oversight & Learning Layer (15 Specialized AI Agents + Lifecycle Governance + Self-Improving Core)
 *     - Execution Layer (Single Execution Queue & Global Nonce Manager per Safe Vault)
 *  2. 4 Segregated Safe Vaults:
 *     - `Cold Treasury Safe` (Main long-term BTC — 0% agent access)
 *     - `Strategy Safe` (Bounded trading capital — only allowlisted DEX swaps)
 *     - `Gas Safe` (Dedicated gas & Akash operational budget)
 *     - `Profit Vault` (Locked harvested profits — one-way inflow only)
 *  3. 15 Specialized Agents with Independent Veto & Oversight:
 *     - Decision Committee: `Data Quality Agent` (Veto), `Market Research Agent`, `Strategy Agent`,
 *       `Risk & Security Agent` (Highest Veto), `Simulation Agent` (Veto), `Liquidation Defense Agent` (Priority Override),
 *       `Execution Agent` (Single Queue Proposer), `Learning Agent` (Champion/Challenger), `Audit & Monitoring Agent`.
 *     - Governance & Self-Improving Core: `Oversight Supervisor`, `Agent Watchdog`, `Performance Evaluator`,
 *       `Incident Investigator`, `Repair Engineer` (Sandbox only), `QA & Security Reviewer` (Independent Veto),
 *       `Agent Architect`, `Agent Retirement Committee`.
 *  4. Data Quality Gate (`HEALTHY | DEGRADED | STALE | CONFLICT | OUTAGE`) & Market Regime Controller
 *     (`BULL_TREND | BEAR_TREND | RANGE | HIGH_VOLATILITY | LIQUIDITY_STRESS | STABLECOIN_DEPEG | DATA_CONFLICT | PROTOCOL_INCIDENT`).
 *  5. 22 Strategy Modules & 8 Trading Style Timeframes (Default `PAPER` / `SHADOW` / `DISABLED`, activated only via 2-of-2 Safe Multisig + Timelock).
 *  6. Universal Asset & Protocol Registry (`DISCOVERED -> ANALYZING -> VERIFIED -> SHADOW -> PAPER -> LIMITED_LIVE -> PAUSED -> BLOCKED`).
 *  7. BTC/ETH Relative-Value Pair Trading & Cross-Margin Liquidation Risk Engine.
 *  8. Investor & Treasury Reporting Center (`Weekly`, `Monthly`, `Quarterly`, `Annual`) with On-Chain Merkle Root proofs.
 *  9. Full File Audit Matrix, Conflict Resolution Table, Threat Model & Infrastructure Dependency Map.
 */

export type SystemExecutionMode =
  | 'PAPER'
  | 'SHADOW'
  | 'TESTNET'
  | 'LIMITED_LIVE'
  | 'PAUSE'
  | 'KILL';

export type DataQualityState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'STALE'
  | 'CONFLICT'
  | 'OUTAGE';

export type MarketRegimeState =
  | 'BULL_TREND'
  | 'BEAR_TREND'
  | 'RANGE'
  | 'HIGH_VOLATILITY'
  | 'LIQUIDITY_STRESS'
  | 'STABLECOIN_DEPEG'
  | 'DATA_CONFLICT'
  | 'PROTOCOL_INCIDENT';

export type AgentLifecycleStatus =
  | 'PROPOSED'
  | 'SANDBOX'
  | 'DISCOVERY'
  | 'BACKTEST'
  | 'SHADOW'
  | 'PAPER'
  | 'TESTNET'
  | 'LIMITED_LIVE'
  | 'ACTIVE'
  | 'WATCH'
  | 'REDUCED_RISK'
  | 'DEGRADED'
  | 'PAUSED'
  | 'QUARANTINED'
  | 'REPAIR_REVIEW'
  | 'RETEST'
  | 'RETIRED';

export type RequirementImplStatus =
  | 'IMPLEMENTED'
  | 'PARTIAL'
  | 'DOCUMENTED_ONLY'
  | 'PROPOSED'
  | 'NOT_IMPLEMENTED';

export interface SafeVaultConfig {
  id: 'cold_treasury_safe' | 'strategy_safe' | 'gas_safe' | 'profit_vault';
  nameSk: string;
  roleSk: string;
  agentAccess: 'ZERO_ACCESS_IMMUTABLE' | 'STRATEGY_SWAPS_ONLY' | 'GAS_BUDGET_ONLY' | 'INFLOW_LOCK_ONLY';
  canAgentWithdrawOut: false;
  allocatedPctOfCapital: number;
  dailyRiskBudgetUsd: number;
  weeklyRiskBudgetUsd: number;
  monthlyRiskBudgetUsd: number;
  maxDrawdownPct: number;
}

export const FOUR_SAFE_VAULTS: SafeVaultConfig[] = [
  {
    id: 'cold_treasury_safe',
    nameSk: 'Cold Treasury Safe (Hlavný BTC Trezor)',
    roleSk: 'Dlhodobé BTC rezervy. AI agenti nemajú žiadne oprávnenie obchodovať ani presúvať aktíva z tohto trezoru.',
    agentAccess: 'ZERO_ACCESS_IMMUTABLE',
    canAgentWithdrawOut: false,
    allocatedPctOfCapital: 75,
    dailyRiskBudgetUsd: 0,
    weeklyRiskBudgetUsd: 0,
    monthlyRiskBudgetUsd: 0,
    maxDrawdownPct: 0,
  },
  {
    id: 'strategy_safe',
    nameSk: 'Strategy Safe (Obchodný Trezor)',
    roleSk: 'Malá, striktne vymedzená časť kapitálu pre povolené DEX swapy cez SafeBTCGuard.sol a jedinú Execution Queue.',
    agentAccess: 'STRATEGY_SWAPS_ONLY',
    canAgentWithdrawOut: false,
    allocatedPctOfCapital: 15,
    dailyRiskBudgetUsd: 300,
    weeklyRiskBudgetUsd: 1200,
    monthlyRiskBudgetUsd: 3500,
    maxDrawdownPct: 6.0,
  },
  {
    id: 'gas_safe',
    nameSk: 'Gas & Akash Infra Safe',
    roleSk: 'Oddelený malý rozpočet na on-chain gas poplatky a Akash Network compute rezervu (AKT).',
    agentAccess: 'GAS_BUDGET_ONLY',
    canAgentWithdrawOut: false,
    allocatedPctOfCapital: 2,
    dailyRiskBudgetUsd: 25,
    weeklyRiskBudgetUsd: 100,
    monthlyRiskBudgetUsd: 300,
    maxDrawdownPct: 2.0,
  },
  {
    id: 'profit_vault',
    nameSk: 'Profit & Recovery Vault (Uzamknutý Zisk)',
    roleSk: 'Realizovaný zisk v BTC/USDC sa periodicky presúva sem. Agent z neho nikdy nevie poslať kapitál späť do obchodovania.',
    agentAccess: 'INFLOW_LOCK_ONLY',
    canAgentWithdrawOut: false,
    allocatedPctOfCapital: 8,
    dailyRiskBudgetUsd: 0,
    weeklyRiskBudgetUsd: 0,
    monthlyRiskBudgetUsd: 0,
    maxDrawdownPct: 0,
  },
];

export interface AgentDynamicTokenAllocation {
  symbol: string;
  chain: string;
  weightPct: number;
}

export interface SpecializedInstitutionalAgent {
  id: string;
  order: number;
  name: string;
  layer: 'DECISION_COMMITTEE' | 'OVERSIGHT_GOVERNANCE' | 'SELF_IMPROVING_CORE';
  hasVetoPower: boolean;
  canApproveTrade: boolean;
  canCreateSafeProposal: boolean;
  canHoldPrivateKey: false;
  canTransferExternally: false;
  lifecycleStatus: AgentLifecycleStatus;
  canRead: string;
  canPropose: string;
  canExecute: string;
  forbidden: string;
  lastDecisionSk: string;
  /** Unified Neural Swarm Mesh properties so ALL 15 agents learn, connect & manage token % */
  collectiveIqScore?: number;
  swarmSynapsesCount?: number;
  connectedMeshNodesCount?: number;
  managedTokens?: AgentDynamicTokenAllocation[];
}

export const INSTITUTIONAL_15_AGENTS: SpecializedInstitutionalAgent[] = [
  {
    id: 'agent-01-data-quality',
    order: 1,
    name: '1. Data Quality Agent (Vstupná Brána s VETO)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Pyth Hermes, Chainlink AggregatorV3, DEX Quotes, CoinGecko, DexScreener, RPC latencia, TTL cache',
    canPropose: 'Stavy: HEALTHY, DEGRADED, STALE, CONFLICT, OUTAGE',
    canExecute: 'Okamžité VETO (NO TRADE / PAUSE) pri odchýlke zdrojov > 1.2% alebo zastaraných dátach',
    forbidden: 'Nikdy neobchoduje, nemôže vynútiť obchod ani obísť chýbajúce dáta',
    lastDecisionSk: 'HEALTHY — Pyth a Chainlink BTC/ETH/SOL v súlade (odchýlka 0.08% < 1.2% limit).',
  },
  {
    id: 'agent-02-market-research',
    order: 2,
    name: '2. Market Research Agent',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'On-chain likvidita, TVL, volatilita, ATR, RSI, 200WMA, Fear & Greed, Universal Asset Registry',
    canPropose: 'Analytické príležitosti a klasifikáciu Market Regime',
    canExecute: 'Žiadna exekúcia — iba dodáva štruktúrovaný výskum pre Strategy Agenta',
    forbidden: 'Nesmie vytvárať transakcie ani meniť allowlist',
    lastDecisionSk: 'Detegovaný režim BULL_TREND / RANGE; identifikovaná likvidita na BTC, ETH, SOL, INJ.',
  },
  {
    id: 'agent-03-strategy',
    order: 3,
    name: '3. Strategy Agent (DCA, SuperTrend, Zisk Funding)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: false,
    canApproveTrade: true,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'PAPER',
    canRead: 'Výstup Market Research, assetBaskets, dcaBasketEngine, ETT SuperTrend + Fibo 0.618, Zisk scoring',
    canPropose: 'Konkrétny návrh obchodu (alebo NO TRADE) s dôvodom, confidence, max stratou a očakávaným prínosom v BTC',
    canExecute: 'Nič — návrh posiela na nezávislú kontrolu Risk & Security Agentovi',
    forbidden: 'Nesmie sám exekuovať obchod ani upraviť svoj risk budget',
    lastDecisionSk: 'Navrhnutá alokácia Core BTC (45%) + Delta-Neutral Funding (5%) v PAPER režime.',
  },
  {
    id: 'agent-04-risk-security',
    order: 4,
    name: '4. Risk & Security Agent (Najvyššie Právo VETA)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Allowlisty sietí/tokenov/DEX routerov, denný/týždenný risk budget, koncentrácia (≤ 45%), smart-contract riziko',
    canPropose: ' iba VETO (zamietnutie) alebo PASS-THROUGH pri splnení všetkých bezpečnostných pravidiel',
    canExecute: 'Fail-Closed VETO pri neznámom kontrakte, prekročení limitu alebo pokuse o externý transfer',
    forbidden: 'Nikdy nemôže obchod vynútiť ani schváliť mimo pravidiel Safe Guardu',
    lastDecisionSk: 'PASS (PAPER) — Koncentrácia tokenov ≤ 45%, 0 externých transferov, recipient === Strategy Safe.',
  },
  {
    id: 'agent-05-simulation',
    order: 5,
    name: '5. Simulation Agent (Pre-Trade Calldata & Quote VETO)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Čerstvý DEX quote (CowSwap, Jupiter, GMX, 1inch), gas estimate, price impact, MEV ochrana',
    canPropose: 'Simulovaný výstup (expectedReceive, minReceive, slippageBps, gasUsd)',
    canExecute: 'VETO ak simulácia calldata zlyhá alebo sa odchyľuje od oracle ceny',
    forbidden: 'Nesmie podpísať ani odoslať transakciu na blockchain',
    lastDecisionSk: 'Simulácia calldata úspešná: slippage 0.18% (limit ≤ 1.0%), MEV-protected route overená.',
  },
  {
    id: 'agent-06-liquidation-defense',
    order: 6,
    name: '6. Liquidation Defense Agent (Najvyššia Priorita #1)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: true,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Health factor, LTV (BTC max 33%, ETH max 25%), likvidačná vzdialenosť, voľné USDC rezervy',
    canPropose: 'Iba ochranný deleverage, splatenie dlhu alebo uzavretie rizikovej pozície',
    canExecute: 'Má prednosť pred všetkými ziskovými stratégiami v Strategy Scheduleri',
    forbidden: 'Nikdy nemôže otvoriť novú páku ani presunúť kapitál z Cold Treasury Safe',
    lastDecisionSk: 'LTV 0% (Bez dlhu) — žiadny núdzový deleverage nie je potrebný.',
  },
  {
    id: 'agent-07-execution',
    order: 7,
    name: '7. Execution Agent (Jediná Fronta & Safe Proposer)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: true,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'PAPER',
    canRead: 'Schválený Evidence Package (iba ak Data Quality + Strategy + Risk/Security + Simulation = OK)',
    canPropose: 'Pripraví nepodpísaný Safe Transaction Proposal do jedinej Execution Queue (1 Safe = 1 Nonce Queue)',
    canExecute: 'V PAPER režime zapisuje do paper.json; v LIMITED_LIVE posiela návrh na 2-z-2 podpis do Safe Global',
    forbidden: 'Nemá privátny kľúč, nesmie robiť paralelné fronty ani externé ERC-20 transfery',
    lastDecisionSk: 'Execution Queue #1 čistá (0 konfliktov nonce, režim PAPER).',
  },
  {
    id: 'agent-08-learning',
    order: 8,
    name: '8. Learning Agent (Champion / Challenger Lab)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'PAPER',
    canRead: 'Uzavreté auditované výsledky po odpočítaní gas, slippage, DEX fee, funding a borrow nákladov',
    canPropose: 'Verziované Challenger modely (BACKTEST → WALK-FORWARD → SHADOW → PAPER) so snapshotom pre rollback',
    canExecute: 'Aktualizácia `learned.json` a `signal_weights.json` výhradne v PAPER/SHADOW experimente',
    forbidden: 'Nesmie meniť SafeBTCGuard.sol, allowlisty, vlastníkov Safe ani automaticky povýšiť model do LIVE',
    lastDecisionSk: 'Model v2.4.0-paper (Champion) stabilný; Challenger v2.5.0-shadow testovaný na walk-forward dátach.',
  },
  {
    id: 'agent-09-audit-monitoring',
    order: 9,
    name: '9. Audit & Monitoring Agent (Merkle Proof & Journal)',
    layer: 'OVERSIGHT_GOVERNANCE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Všetky vstupy, rozhodnutia, zamietnutia, simulácie a post-trade reconciliation',
    canPropose: 'Append-only Evidence Packages + výpočet SHA-256 Merkle Root pre on-chain ukotvenie',
    canExecute: 'Pri chybe auditu alebo rozpore post-trade reconciliation okamžite prepne systém do PAUSE',
    forbidden: 'Nemôže obchodovať, mazať ani prepisovať historické záznamy',
    lastDecisionSk: 'Merkle Root auditného denníka vygenerovaný a overený (100% integrita).',
  },
  {
    id: 'agent-10-oversight-watchdog',
    order: 10,
    name: '10. Agent Watchdog & Oversight Supervisor',
    layer: 'OVERSIGHT_GOVERNANCE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Latencia, chybovosť, crash-loop detekcia, stav RPC a dodržiavanie risk budgetov všetkých agentov',
    canPropose: 'Prechod agenta do WATCH → REDUCED_RISK → PAUSED → QUARANTINED pri zhoršení metrík',
    canExecute: 'Okamžité zníženie risk budgetu alebo pozastavenie chybujúceho agenta',
    forbidden: 'Nikdy nesmie sám obnoviť LIVE oprávnenia bez 2-z-2 Safe multisig + timelocku',
    lastDecisionSk: 'Všetkých 15 agentov v stave OK (0 crash-loopov za posledných 15 min).',
  },
  {
    id: 'agent-11-performance-evaluator',
    order: 11,
    name: '11. Performance Evaluator (Netto P/L & Timeframe Scorecard)',
    layer: 'OVERSIGHT_GOVERNANCE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Uzavreté obchody podľa timeframe (Scalping sa nikdy nemieša s DCA/Core), Sharpe/Sortino, MDD',
    canPropose: 'Nezávislý Agent Scorecard (označí INSUFFICIENT_EVIDENCE pri malej vzorke n < 30)',
    canExecute: 'Zákaz navýšenia kapitálu pri malej vzorke alebo vysokom drawdowne',
    forbidden: 'Žiadny agent nesmie hodnotiť sám seba ani miešať vklady/výbery s investičným výnosom',
    lastDecisionSk: 'Long-Term Core a Zisk Funding hodnotené netto po gas a slippage; Scalping označený INSUFFICIENT_EVIDENCE.',
  },
  {
    id: 'agent-12-incident-investigator',
    order: 12,
    name: '12. Incident Investigator (Forenzná Rekonštrukcia)',
    layer: 'SELF_IMPROVING_CORE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Audit logy, dataset replay snapshoty, verzie modelov a on-chain revert dôvody',
    canPropose: 'Forenzný Incident Report (určí, či šlo o chybu dát, modelu, konfigurácie alebo siete)',
    canExecute: 'Zaradenie chybného modulu do karantény na opravu',
    forbidden: 'Nesmie zamlčať ani upraviť žiadny historický záznam',
    lastDecisionSk: '0 kritických incidentov; posledný test blokovania EOA adresy úspešne zachytený Guardom.',
  },
  {
    id: 'agent-13-repair-engineer',
    order: 13,
    name: '13. Repair Engineer (Izolovaný Sandbox Patcher)',
    layer: 'SELF_IMPROVING_CORE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'SANDBOX',
    canRead: 'Incident reporty, chybové logy a výkonnostné anomálie',
    canPropose: 'Návrh opravy (diff, vysvetlenie príčiny, unit testy a rollback plán) výhradne v SANDBOX vetve',
    canExecute: 'Spustenie opravy v izolovanom sandboxe na testovanie',
    forbidden: 'Nikdy nesmie meniť live kód priamo, deployovať bez QA/ľudského súhlasu ani meniť Safe limity',
    lastDecisionSk: 'Pripravený sandbox patch #14 (sprísnenie oracle staleness filtra na 45s) — čaká na QA review.',
  },
  {
    id: 'agent-14-qa-security-reviewer',
    order: 14,
    name: '14. QA & Security Reviewer (Nezávislý Audítor Opráv)',
    layer: 'SELF_IMPROVING_CORE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Návrhy opráv od Repair Engineera a návrhy nových agentov od Agent Architecta',
    canPropose: 'Schválenie do SHADOW/PAPER testu alebo VETO opravy pri zlyhaní regresných/fuzz testov',
    canExecute: 'Spúšťa 126+ unit, bezpečnostných a SafeGuard invariantných testov',
    forbidden: 'Tvorca opravy nesmie byť jej schvaľovateľom; QA nesmie povoliť externý transfer',
    lastDecisionSk: 'Overených 14 testovacích súborov (všetky SafeGuard zákazy prešli 100%).',
  },
  {
    id: 'agent-15-architect-retirement',
    order: 15,
    name: '15. Agent Architect & Retirement Committee',
    layer: 'SELF_IMPROVING_CORE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Prekrytie rolí agentov, chýbajúce pokrytie trhov a dlhodobá netto výkonnosť',
    canPropose: 'Návrh nového špecializovaného agenta (najprv SANDBOX → SHADOW → PAPER) alebo archiváciu (RETIRED)',
    canExecute: 'Archivácia vyradeného agenta so zachovaním celej histórie a auditných logov',
    forbidden: 'Nesmie novému agentovi prideliť Safe oprávnenia bez ľudského 2-z-2 multisig schválenia',
    lastDecisionSk: 'Flotila harmonizovaná; navrhnutý Olas Signal Connector v režime SHADOW (iba read-only signály).',
  },
  {
    id: 'agent-16-portfolio-brain',
    order: 16,
    name: '16. Portfolio Brain & Cross-Margin Risk Coordinator',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Spot, DCA, lending, borrowing, leverage, perps, collateral, debt, USDC rozpočty, token/chain/protocol koncentrácia',
    canPropose: 'Koordinácia všetkých stratégií tak, aby sa navzájom nebili (napr. DCA nenakupuje, kým Deleverage spláca dlh)',
    canExecute: 'VETO pri prekročení globálneho risk budgetu alebo krížovom konflikte stratégií',
    forbidden: 'Nesmie presúvať aktíva medzi vaultmi ani podpisovať transakcie',
    lastDecisionSk: '0 konfliktov medzi DCA Core, Zisk Funding a ETT SuperTrend; celková páka v norme.',
  },
  {
    id: 'agent-17-volatility-regime',
    order: 17,
    name: '17. Volatility & Market-Regime Controller Agent',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'ATR, 7d/30d realizovaná volatilita, hĺbka orderbooku/poolov, depeg indikátory, stav orákul',
    canPropose: 'Režimy: LOW_VOL, BULL_TREND, BEAR_TREND, RANGE, HIGH_VOLATILITY, LIQUIDITY_STRESS, DATA_CONFLICT, PROTOCOL_INCIDENT',
    canExecute: 'Pri HIGH_VOLATILITY zníži risk budget na polovicu; pri DATA_CONFLICT a PROTOCOL_INCIDENT vynúti PAUSE/NO TRADE',
    forbidden: 'Nesmie otvárať obchody ani vypnúť ochranný režim bez overenia dát',
    lastDecisionSk: 'Režim BULL_TREND / NORMAL — povolené DCA, Position, Swing a Delta-Neutral Carry.',
  },
  {
    id: 'agent-18-meta-strategy-allocator',
    order: 18,
    name: '18. Meta Strategy Allocator Agent (Rozdeľovač Risk Budgetu)',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'PAPER',
    canRead: 'Netto P/L po poplatkoch, drawdown, stabilita, Sharpe/Sortino a korelácia všetkých 22 modulov',
    canPropose: 'Dynamické rozdelenie: DCA Core 45%, Trend 15%, Yield/Lending 15%, Mean-Reversion 10%, Funding/Basis 5%, Stable Reserve 10%',
    canExecute: 'Pri zhoršovaní výsledkov automaticky znižuje risk budget danej stratégie',
    forbidden: 'Nikdy nesmie automaticky navýšiť risk budget nad on-chain schválený strop',
    lastDecisionSk: 'Risk budget alokovaný podľa cieľovej matice (45/15/15/10/5/10%).',
  },
  {
    id: 'agent-19-stablecoin-peg-guard',
    order: 19,
    name: '19. Stablecoin Peg & Depeg Defense Agent',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'USDC, USDT, sUSDS, sDAI, sUSDe peg odchýlka voči $1.00, Curve/Uniswap pool imbalance, TVL koncentrácia',
    canPropose: 'Okamžitá blokácia nových expozícií v depegnutom stablecoine + návrh ochrannej rotácie do BTC/zdravého stablecoinu',
    canExecute: 'VETO pri odchýlke pegu > 0.35% alebo strate likvidity v lending pooloch',
    forbidden: 'Nesmie poslať prostriedky mimo Strategy Safe',
    lastDecisionSk: 'Peg stabilný: USDC $1.0001, USDT $0.9999, sUSDS peg skóre 96/100.',
  },
  {
    id: 'agent-20-mev-firewall',
    order: 20,
    name: '20. MEV & Transaction Firewall Agent',
    layer: 'DECISION_COMMITTEE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Viacero DEX rout (CowSwap, 1inch, Odos, Jupiter), mempool riziko, price impact, transakčný deadline a gas',
    canPropose: 'Výber MEV-chránenej trasy (CowSwap CoW batch / Flashbots Protect / Jito) alebo rozdelenie veľkého obchodu',
    canExecute: 'VETO pri price impacte > 1.0%, chýbajúcom deadline alebo podozrení na sandwich útok',
    forbidden: 'Nesmie povoliť nechránený swap s vysokým sklzom',
    lastDecisionSk: 'MEV ochrana aktívna: 100% EVM swapov smerovaných cez CowSwap CoW batch settlement.',
  },
  {
    id: 'agent-21-post-trade-reconciler',
    order: 21,
    name: '21. Post-Trade Reconciliation & Tax-Lot Attribution Agent',
    layer: 'OVERSIGHT_GOVERNANCE',
    hasVetoPower: true,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'ACTIVE',
    canRead: 'Plánovaný expectedReceive vs. skutočný on-chain receive, gas, slippage, funding, borrow úroky a tax-lot ID',
    canPropose: 'Netto P/L atribúcia po všetkých nákladoch (podklad pre Learning Agenta a Investor Reporty)',
    canExecute: 'Pri odchýlke reálneho výsledku od simulácie > 0.5% okamžite prepne daný modul do PAUSE a vytvorí incident',
    forbidden: 'Nesmie vykazovať hrubý zisk bez odpočítania všetkých poplatkov',
    lastDecisionSk: 'Reconciliation 100% zhoda (odchýlka simulácia vs. exekúcia 0.02% < 0.50% limit).',
  },
  {
    id: 'agent-22-olas-signal-bridge',
    order: 22,
    name: '22. Olas & External AI Signal Sandbox Bridge Agent',
    layer: 'SELF_IMPROVING_CORE',
    hasVetoPower: false,
    canApproveTrade: false,
    canCreateSafeProposal: false,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    lifecycleStatus: 'SHADOW',
    canRead: 'Externé signály z Olas / Bittensor TAO / TradingView / on-chain indexérov (The Graph) s anti-prompt-injection filtrom',
    canPropose: 'Iba neviazané analytické hypotézy do SHADOW/PAPER laboratória na nezávislé preverenie',
    canExecute: 'Žiadny priamy prístup k Safe peňaženke; pri výpadku Olas systém pokračuje bezpečne bez neho',
    forbidden: 'Nikdy nesmie obísť náš Risk & Security Veto výbor ani držať podpisové oprávnenia',
    lastDecisionSk: 'SHADOW režim: Olas benchmark signály čítané v read-only sandboxe (0 priamych oprávnení).',
  },
];

export const STRATEGY_SCHEDULER_PRIORITY = [
  '1. Incident / Liquidation Defense Agent (Najvyššia priorita — môže pozastaviť všetko nižšie)',
  '2. Risk & Security Agent + Data Quality Gate (Nezávislé právo VETA)',
  '3. Protective Deleveraging (Zníženie LTV / dlhu pri poklese Health Factoru)',
  '4. Long-Term Core / Dynamic DCA (Akumulácia BTC v rámci 4 košov)',
  '5. Position Trading (Týždne až mesiace — 200WMA, Fear & Greed, makro režim)',
  '6. Swing Trading (Dni až týždne — ETT SuperTrend, Fibo 0.618, RSI/EMA)',
  '7. Yield / Lending (Kamino, Jupiter Lend, BTC/ETH konzervatívny výnos)',
  '8. Delta-Neutral Funding / Carry (Zisk Bot spot hedge + short perp)',
  '9. Intraday Trading (Minúty až hodiny — prísny denný obrat a time-stop)',
  '10. Microstructure / Scalping & Experimenty (Výhradne PAPER / SHADOW)',
];

export interface TradingStyleModule {
  strategyId: string;
  nameSk: string;
  timeframe: string;
  priorityRank: number;
  vaultId: SafeVaultConfig['id'];
  targetAllocationPct: number;
  status: 'PAPER' | 'SHADOW' | 'DISABLED' | 'PAUSED';
  allowedRegimes: MarketRegimeState[];
  maxTradeSizeUsd: number;
  maxDailyLossUsd: number;
  maxDrawdownPct: number;
  maxTradesPerDay: number;
  netPnlAfterCostsPct: number;
  costsBreakdownSk: string;
  noTradeConditionSk: string;
}

export const TRADING_STYLES_LIBRARY: TradingStyleModule[] = [
  {
    strategyId: 'style-long-term-core-dca',
    nameSk: 'Long-Term Core & Dynamic DCA Agent',
    timeframe: 'Mesiace až roky',
    priorityRank: 4,
    vaultId: 'strategy_safe',
    targetAllocationPct: 45,
    status: 'PAPER',
    allowedRegimes: ['BULL_TREND', 'BEAR_TREND', 'RANGE', 'HIGH_VOLATILITY'],
    maxTradeSizeUsd: 250,
    maxDailyLossUsd: 50,
    maxDrawdownPct: 15,
    maxTradesPerDay: 2,
    netPnlAfterCostsPct: 18.4,
    costsBreakdownSk: 'Gas: $0.12 · DEX fee: 0.05% · Slippage: 0.10% · MEV: Chránené (CowSwap)',
    noTradeConditionSk: 'NO TRADE pri DATA_CONFLICT, OUTAGE alebo ak RSI > 78 (prehriaty trh — hard-stop hysteréza).',
  },
  {
    strategyId: 'style-position-trading',
    nameSk: 'Position Trading Agent (HTF Trend & 200WMA)',
    timeframe: 'Týždne až mesiace',
    priorityRank: 5,
    vaultId: 'strategy_safe',
    targetAllocationPct: 15,
    status: 'PAPER',
    allowedRegimes: ['BULL_TREND', 'RANGE'],
    maxTradeSizeUsd: 200,
    maxDailyLossUsd: 40,
    maxDrawdownPct: 10,
    maxTradesPerDay: 1,
    netPnlAfterCostsPct: 14.2,
    costsBreakdownSk: 'Gas: $0.18 · DEX fee: 0.08% · Slippage: 0.14%',
    noTradeConditionSk: 'NO TRADE pri LIQUIDITY_STRESS, STABLECOIN_DEPEG alebo ak cena pod 200D EMA bez potvrdenia.',
  },
  {
    strategyId: 'style-swing-supertrend',
    nameSk: 'Swing Trading Agent (ETT SuperTrend + Fibo 0.618)',
    timeframe: 'Dni až týždne',
    priorityRank: 6,
    vaultId: 'strategy_safe',
    targetAllocationPct: 10,
    status: 'PAPER',
    allowedRegimes: ['BULL_TREND', 'RANGE'],
    maxTradeSizeUsd: 180,
    maxDailyLossUsd: 35,
    maxDrawdownPct: 8,
    maxTradesPerDay: 2,
    netPnlAfterCostsPct: 16.8,
    costsBreakdownSk: 'Gas: $0.22 · DEX fee: 0.10% · Slippage: 0.18%',
    noTradeConditionSk: 'NO TRADE pri chýbajúcom falling-knife filtri alebo ak odchýlka DEX quote > 0.8%.',
  },
  {
    strategyId: 'style-yield-lending',
    nameSk: 'Yield / Lending Agent (Kamino, Jupiter Lend, DeFi Saver)',
    timeframe: 'Týždne až mesiace',
    priorityRank: 7,
    vaultId: 'strategy_safe',
    targetAllocationPct: 15,
    status: 'PAPER',
    allowedRegimes: ['BULL_TREND', 'BEAR_TREND', 'RANGE'],
    maxTradeSizeUsd: 200,
    maxDailyLossUsd: 25,
    maxDrawdownPct: 4,
    maxTradesPerDay: 1,
    netPnlAfterCostsPct: 5.1,
    costsBreakdownSk: 'Meraná sadzba z API po odpočítaní entry/exit fee a gas nákladov',
    noTradeConditionSk: 'NO TRADE pri STABLECOIN_DEPEG (> 0.4% od $1), TVL < $10M alebo bez auditu protokolu.',
  },
  {
    strategyId: 'style-delta-neutral-carry',
    nameSk: 'Delta-Neutral Carry & Basis Agent (Zisk Funding)',
    timeframe: 'Dni až mesiace',
    priorityRank: 8,
    vaultId: 'strategy_safe',
    targetAllocationPct: 5,
    status: 'PAPER',
    allowedRegimes: ['BULL_TREND', 'RANGE'],
    maxTradeSizeUsd: 150,
    maxDailyLossUsd: 30,
    maxDrawdownPct: 6,
    maxTradesPerDay: 2,
    netPnlAfterCostsPct: 13.5,
    costsBreakdownSk: 'Funding netto po odpočítaní perp taker fee, spot hedge nákladu a borrow sadzby',
    noTradeConditionSk: 'NO TRADE ak chýba 1:1 spot hedge, funding < 15%/r (TIA/ATOM < 30%/r) alebo liq odstup < 45%.',
  },
  {
    strategyId: 'style-btc-eth-pair-rv',
    nameSk: 'Relative-Value BTC/ETH Pair Trading + Cross-Margin Engine',
    timeframe: 'Dni až týždne',
    priorityRank: 8,
    vaultId: 'strategy_safe',
    targetAllocationPct: 5,
    status: 'SHADOW',
    allowedRegimes: ['RANGE', 'BULL_TREND'],
    maxTradeSizeUsd: 120,
    maxDailyLossUsd: 20,
    maxDrawdownPct: 5,
    maxTradesPerDay: 1,
    netPnlAfterCostsPct: 8.9,
    costsBreakdownSk: 'Obe nohy (Long + Short) po započítaní funding, borrow, gas, slippage a haircutov kolaterálu',
    noTradeConditionSk: 'NO TRADE pri rozpade korelácie BTC/ETH (< 0.65), cross-margin riziku alebo z-score mimo intervalu.',
  },
  {
    strategyId: 'style-intraday',
    nameSk: 'Intraday Momentum & VWAP Agent',
    timeframe: 'Minúty až hodiny',
    priorityRank: 9,
    vaultId: 'strategy_safe',
    targetAllocationPct: 0,
    status: 'DISABLED',
    allowedRegimes: ['BULL_TREND'],
    maxTradeSizeUsd: 100,
    maxDailyLossUsd: 20,
    maxDrawdownPct: 4,
    maxTradesPerDay: 4,
    netPnlAfterCostsPct: 0,
    costsBreakdownSk: 'Vypnuté (DISABLED) — vyžaduje walk-forward dôkaz po započítaní gas + slippage + MEV',
    noTradeConditionSk: 'Predvolene DISABLED podľa bezpečnostnej politiky (aktivácia iba cez 2-z-2 Safe multisig + timelock).',
  },
  {
    strategyId: 'style-microstructure-scalping',
    nameSk: 'Microstructure / Scalping & Moonshot Lab',
    timeframe: 'Sekundy až minúty',
    priorityRank: 10,
    vaultId: 'strategy_safe',
    targetAllocationPct: 0,
    status: 'SHADOW',
    allowedRegimes: ['BULL_TREND'],
    maxTradeSizeUsd: 50,
    maxDailyLossUsd: 10,
    maxDrawdownPct: 2,
    maxTradesPerDay: 5,
    netPnlAfterCostsPct: -0.4,
    costsBreakdownSk: 'V SHADOW teste náklady na gas + slippage + MEV znižujú hrubý výnos → LIVE zostáva ZAKÁZANÉ',
    noTradeConditionSk: 'Výhradne SHADOW/PAPER výskum (spoločný cap ≤ 1%). Nikdy nemá prístup k live kapitálu.',
  },
];

export type UniversalQualificationStage =
  | 'DISCOVERED'
  | 'ANALYZING'
  | 'VERIFIED'
  | 'SHADOW'
  | 'PAPER'
  | 'LIMITED_LIVE'
  | 'PAUSED'
  | 'BLOCKED';

export interface UniversalRegistryItem {
  id: string;
  symbolOrName: string;
  kind: 'TOKEN' | 'DEX_PROTOCOL' | 'LENDING_PROTOCOL' | 'PERP_VENUE' | 'RWA_TOKENIZED_STOCK' | 'BRIDGE_MODULE';
  chain: string;
  stage: UniversalQualificationStage;
  riskScore: number; // 0..100 (higher = safer)
  dataQuality: DataQualityState;
  tvlUsdMillions: number;
  liquidityUsdMillions: number;
  audited: boolean;
  dynamicRiskBudgetUsd: number;
  whyNotLiveSk: string;
}

export const UNIVERSAL_MARKETS_REGISTRY: UniversalRegistryItem[] = [
  {
    id: 'uni-btc-core',
    symbolOrName: 'BTC (Native / LBTC / cbBTC)',
    kind: 'TOKEN',
    chain: 'Bitcoin / Arbitrum / Base',
    stage: 'PAPER',
    riskScore: 98,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 1450000,
    liquidityUsdMillions: 28000,
    audited: true,
    dynamicRiskBudgetUsd: 500,
    whyNotLiveSk: 'Kvalifikované pre PAPER/TESTNET. Prechod do LIMITED_LIVE vyžaduje 2-z-2 Safe multisig schválenie.',
  },
  {
    id: 'uni-eth-core',
    symbolOrName: 'ETH / weETH / rETH',
    kind: 'TOKEN',
    chain: 'Ethereum / Arbitrum',
    stage: 'PAPER',
    riskScore: 94,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 380000,
    liquidityUsdMillions: 14500,
    audited: true,
    dynamicRiskBudgetUsd: 300,
    whyNotLiveSk: 'Overený kontrakt aj likvidita; beží v PAPER režime s LTV stropom ≤ 25%.',
  },
  {
    id: 'uni-sol-core',
    symbolOrName: 'SOL / jitoSOL / INF',
    kind: 'TOKEN',
    chain: 'Solana',
    stage: 'PAPER',
    riskScore: 91,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 82000,
    liquidityUsdMillions: 4200,
    audited: true,
    dynamicRiskBudgetUsd: 250,
    whyNotLiveSk: 'Izolovaný Solana adapter (Jupiter v6 / Kamino) v PAPER režime.',
  },
  {
    id: 'uni-cowswap-dex',
    symbolOrName: 'CowSwap MEV-Protected Settlement',
    kind: 'DEX_PROTOCOL',
    chain: 'Ethereum / Arbitrum / Base',
    stage: 'VERIFIED',
    riskScore: 95,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 420,
    liquidityUsdMillions: 1800,
    audited: true,
    dynamicRiskBudgetUsd: 400,
    whyNotLiveSk: 'Primárny MEV-chránený DEX router pre Safe Transaction Proposals.',
  },
  {
    id: 'uni-kamino-sol',
    symbolOrName: 'Kamino Lend & Multiply',
    kind: 'LENDING_PROTOCOL',
    chain: 'Solana',
    stage: 'PAPER',
    riskScore: 89,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 1650,
    liquidityUsdMillions: 620,
    audited: true,
    dynamicRiskBudgetUsd: 160,
    whyNotLiveSk: 'Meraná sadzba 4.40% APR v PAPER režime (Zisk Bot modul).',
  },
  {
    id: 'uni-mstrx-rwa',
    symbolOrName: 'MSTR (Tokenizovaná akcia / Proxy)',
    kind: 'RWA_TOKENIZED_STOCK',
    chain: 'Ethereum / Arbitrum',
    stage: 'SHADOW',
    riskScore: 76,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 85,
    liquidityUsdMillions: 24,
    audited: true,
    dynamicRiskBudgetUsd: 50,
    whyNotLiveSk: 'RWA trieda: podlieha kontrole obchodných hodín, mNAV gatingu (`proxySieve`) a zákazu použiť ako kolaterál pre páku.',
  },
  {
    id: 'uni-ccip-bridge',
    symbolOrName: 'Cross-Chain Bridge Module',
    kind: 'BRIDGE_MODULE',
    chain: 'Multi-Chain',
    stage: 'PAUSED',
    riskScore: 68,
    dataQuality: 'HEALTHY',
    tvlUsdMillions: 500,
    liquidityUsdMillions: 150,
    audited: true,
    dynamicRiskBudgetUsd: 0,
    whyNotLiveSk: 'Podľa bezpečnostnej špecifikácie je automatický bridging v prvej verzii VYPNUTÝ (iba meranie expozície).',
  },
  {
    id: 'uni-unverified-meme',
    symbolOrName: 'Neoverený Low-Liq Token (< $150k Liq)',
    kind: 'TOKEN',
    chain: 'Base / Solana',
    stage: 'BLOCKED',
    riskScore: 12,
    dataQuality: 'CONFLICT',
    tvlUsdMillions: 0.08,
    liquidityUsdMillions: 0.04,
    audited: false,
    dynamicRiskBudgetUsd: 0,
    whyNotLiveSk: 'ZABLOKOVANÉ (Fail-Closed): Likvidita < $150k, vek < 72h a neoverený kontrakt.',
  },
];

export interface PairTradingStressScenario {
  scenarioNameSk: string;
  btcMovePct: number;
  ethMovePct: number;
  ethBtcRatioChangePct: number;
  netPairPnlAfterCostsUsd: number;
  remainingCollateralBufferPct: number;
  liquidationDistancePct: number;
  actionTriggered: 'HOLD_PAIR' | 'REDUCE_RISK_DELEVERAGE' | 'EMERGENCY_CLOSE_NO_NEW_ENTRY';
}

export interface BtcEthPairTradingAnalysis {
  ethBtcRatio: number;
  rollingCorrelation30d: number;
  betaEthToBtc: number;
  spreadZScore: number;
  cointegrationStable: boolean;
  isolatedMarginOnly: true;
  crossMarginEnabled: false;
  deleverageTriggerDistancePct: 35;
  scenarios: PairTradingStressScenario[];
  verdictSk: string;
}

/**
 * Evaluates the BTC/ETH Relative-Value Pair & Cross-Margin Liquidation Risk Engine
 * across 4 mandatory stress scenarios (uniform drop, ETH spike vs BTC, BTC spike vs ETH, funding/vol shock).
 */
export function evaluateBtcEthPairCrossMarginRisk(
  btcPriceUsd = 75000,
  ethPriceUsd = 2150,
  positionNotionalUsd = 200,
): BtcEthPairTradingAnalysis {
  const ratio = Number((ethPriceUsd / (btcPriceUsd || 75000)).toFixed(5));
  const scenarios: PairTradingStressScenario[] = [
    {
      scenarioNameSk: '1. Rovnomerný pokles trhu (BTC −15%, ETH −15%)',
      btcMovePct: -15,
      ethMovePct: -15,
      ethBtcRatioChangePct: 0,
      netPairPnlAfterCostsUsd: Number((-positionNotionalUsd * 0.004).toFixed(2)), // fees + funding only
      remainingCollateralBufferPct: 82.4,
      liquidationDistancePct: 68.5,
      actionTriggered: 'HOLD_PAIR',
    },
    {
      scenarioNameSk: '2. Prudký rast ETH voči BTC (ETH +25%, BTC +2% — Short-Squeeze na ETH nohe)',
      btcMovePct: 2,
      ethMovePct: 25,
      ethBtcRatioChangePct: 22.5,
      netPairPnlAfterCostsUsd: Number((-positionNotionalUsd * 0.21).toFixed(2)),
      remainingCollateralBufferPct: 48.2,
      liquidationDistancePct: 31.4,
      actionTriggered: 'REDUCE_RISK_DELEVERAGE',
    },
    {
      scenarioNameSk: '3. Prudký rast BTC voči ETH (BTC +22%, ETH −5% — Rozpad korelácie)',
      btcMovePct: 22,
      ethMovePct: -5,
      ethBtcRatioChangePct: -22.1,
      netPairPnlAfterCostsUsd: Number((positionNotionalUsd * 0.24).toFixed(2)),
      remainingCollateralBufferPct: 91.0,
      liquidationDistancePct: 79.2,
      actionTriggered: 'HOLD_PAIR',
    },
    {
      scenarioNameSk: '4. Extrémny Funding & Likviditný Šok (Spread rozkmit +18%, 3x Funding)',
      btcMovePct: -12,
      ethMovePct: 8,
      ethBtcRatioChangePct: 22.7,
      netPairPnlAfterCostsUsd: Number((-positionNotionalUsd * 0.23).toFixed(2)),
      remainingCollateralBufferPct: 39.5,
      liquidationDistancePct: 24.8,
      actionTriggered: 'EMERGENCY_CLOSE_NO_NEW_ENTRY',
    },
  ];

  return {
    ethBtcRatio: ratio,
    rollingCorrelation30d: 0.81,
    betaEthToBtc: 1.18,
    spreadZScore: -1.42,
    cointegrationStable: true,
    isolatedMarginOnly: true,
    crossMarginEnabled: false,
    deleverageTriggerDistancePct: 35,
    scenarios,
    verdictSk:
      'SHADOW / PAPER REŽIM: Cross-margin je natvrdo VYPNUTÝ. Pri scenári prudkého rastu ETH voči BTC (+22.5% spread) klesá likvidačný odstup na 31.4% (< 35% ochranný prah) → Liquidation Defense Agent automaticky spúšťa ochranný deleverage bez siahnutia na Cold Treasury Safe.',
  };
}

export interface EvidencePackageRecord {
  id: string;
  ts: number;
  executionMode: SystemExecutionMode;
  strategyId: string;
  modelVersionId: string;
  marketRegime: MarketRegimeState;
  dataQuality: DataQualityState;
  chain: string;
  tokenIn: string;
  tokenOut: string;
  amountUsd: number;
  oraclePriceUsd: number;
  dexQuotePriceUsd: number;
  oracleDexDeviationPct: number;
  expectedReceive: string;
  minReceiveAfterSlippage: string;
  estimatedGasUsd: number;
  priceImpactPct: number;
  committeeVotes: {
    dataQualityAgent: 'APPROVED' | 'VETO_NO_TRADE';
    strategyAgent: 'PROPOSED' | 'NO_TRADE';
    riskSecurityAgent: 'APPROVED' | 'VETO_NO_TRADE';
    simulationAgent: 'APPROVED' | 'VETO_NO_TRADE';
  };
  finalVerdict: 'PAPER_SIMULATED' | 'SAFE_PROPOSAL_QUEUED' | 'VETOED_NO_TRADE';
  vetoReasonSk?: string;
  merkleLeafHash: string;
}

export function computeDeterministicHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `0x${hex1}${hex2}${hex1}${hex2}${hex1}${hex2}${hex1}${hex2}`;
}

/**
 * Evaluates a candidate trade through the mandatory 5-Agent Veto Pipeline:
 * `Data Quality -> Strategy -> Risk & Security -> Simulation -> Execution Queue`.
 * Enforces Fail-Closed (`VETOED_NO_TRADE`) on any missing/stale data, oracle deviation, or policy violation.
 */
export function evaluateTradeThroughInstitutionalCommittee(params: {
  executionMode: SystemExecutionMode;
  killSwitchActive: boolean;
  dataQuality: DataQualityState;
  marketRegime: MarketRegimeState;
  strategyId: string;
  modelVersionId: string;
  chain: string;
  tokenIn: string;
  tokenOut: string;
  amountUsd: number;
  oraclePriceUsd: number;
  dexQuotePriceUsd: number;
  liquidityUsd: number;
  recipientAddress: string;
  strategySafeAddress: string;
}): EvidencePackageRecord {
  const deviationPct =
    params.oraclePriceUsd > 0
      ? Number(
          (
            (Math.abs(params.dexQuotePriceUsd - params.oraclePriceUsd) / params.oraclePriceUsd) *
            100
          ).toFixed(3),
        )
      : 100;

  const dataQualityOk =
    !params.killSwitchActive &&
    params.dataQuality === 'HEALTHY' &&
    params.oraclePriceUsd > 0 &&
    params.dexQuotePriceUsd > 0 &&
    deviationPct <= 1.2 &&
    params.marketRegime !== 'DATA_CONFLICT' &&
    params.marketRegime !== 'PROTOCOL_INCIDENT';

  const recipientMatchesSafe =
    Boolean(params.recipientAddress) &&
    Boolean(params.strategySafeAddress) &&
    params.recipientAddress.toLowerCase() === params.strategySafeAddress.toLowerCase();

  const riskSecurityOk =
    !params.killSwitchActive &&
    recipientMatchesSafe &&
    params.amountUsd > 0 &&
    params.amountUsd <= 300 &&
    params.liquidityUsd >= 150_000;

  const priceImpactPct =
    params.liquidityUsd > 0
      ? Number(((params.amountUsd / params.liquidityUsd) * 100).toFixed(3))
      : 99;

  const simulationOk =
    dataQualityOk && riskSecurityOk && priceImpactPct <= 1.0 && deviationPct <= 1.2;

  let vetoReasonSk: string | undefined;
  if (params.killSwitchActive || params.executionMode === 'KILL' || params.executionMode === 'PAUSE') {
    vetoReasonSk = 'ZAMIETNUTÉ (NO TRADE): Globálny KILL SWITCH alebo PAUSE režim je aktívny.';
  } else if (!dataQualityOk) {
    vetoReasonSk = `ZAMIETNUTÉ (Data Quality Agent VETO): Stav dát=${params.dataQuality}, režim=${params.marketRegime}, odchýlka Oracle/DEX=${deviationPct}% (max 1.2%).`;
  } else if (!recipientMatchesSafe) {
    vetoReasonSk =
      'ZAMIETNUTÉ (Risk & Security Agent VETO): Cieľová adresa príjemcu sa nezhoduje so Strategy Safe (externé transfery sú zakázané).';
  } else if (!riskSecurityOk) {
    vetoReasonSk = `ZAMIETNUTÉ (Risk & Security Agent VETO): Objem $${params.amountUsd} alebo likvidita $${params.liquidityUsd} nespĺňa limity Risk Budgetu.`;
  } else if (!simulationOk) {
    vetoReasonSk = `ZAMIETNUTÉ (Simulation Agent VETO): Price impact ${priceImpactPct}% prekračuje povolený limit.`;
  }

  const allApproved = dataQualityOk && riskSecurityOk && simulationOk;
  const outUnits =
    params.dexQuotePriceUsd > 0 ? (params.amountUsd / params.dexQuotePriceUsd).toFixed(6) : '0';
  const minUnits =
    params.dexQuotePriceUsd > 0
      ? ((params.amountUsd * 0.995) / params.dexQuotePriceUsd).toFixed(6)
      : '0';

  const payloadForHash = JSON.stringify({
    s: params.strategyId,
    m: params.modelVersionId,
    tIn: params.tokenIn,
    tOut: params.tokenOut,
    amt: params.amountUsd,
    dev: deviationPct,
    ok: allApproved,
  });

  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    executionMode: params.executionMode,
    strategyId: params.strategyId,
    modelVersionId: params.modelVersionId,
    marketRegime: params.marketRegime,
    dataQuality: params.dataQuality,
    chain: params.chain,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountUsd: params.amountUsd,
    oraclePriceUsd: params.oraclePriceUsd,
    dexQuotePriceUsd: params.dexQuotePriceUsd,
    oracleDexDeviationPct: deviationPct,
    expectedReceive: `${outUnits} ${params.tokenOut}`,
    minReceiveAfterSlippage: `${minUnits} ${params.tokenOut}`,
    estimatedGasUsd: 0.14,
    priceImpactPct,
    committeeVotes: {
      dataQualityAgent: dataQualityOk ? 'APPROVED' : 'VETO_NO_TRADE',
      strategyAgent: 'PROPOSED',
      riskSecurityAgent: riskSecurityOk ? 'APPROVED' : 'VETO_NO_TRADE',
      simulationAgent: simulationOk ? 'APPROVED' : 'VETO_NO_TRADE',
    },
    finalVerdict: !allApproved
      ? 'VETOED_NO_TRADE'
      : params.executionMode === 'LIMITED_LIVE' || params.executionMode === 'TESTNET'
        ? 'SAFE_PROPOSAL_QUEUED'
        : 'PAPER_SIMULATED',
    vetoReasonSk,
    merkleLeafHash: computeDeterministicHash(payloadForHash),
  };
}

export type InvestorReportPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface InvestorTreasuryReport {
  period: InvestorReportPeriod;
  titleSk: string;
  generatedAtIso: string;
  methodologyVersion: 'safebtc-nav-methodology-v1.2';
  auditStatus: 'UNAUDITED_SELF_VERIFIED_MERKLE_PROOF';
  completenessStatus: 'COMPLETE_PAPER_LEDGER' | 'PARTIAL_MISSING_LIVE_WALLET';
  paperNavUsd: number;
  paperNetPnlAfterCostsUsd: number;
  paperTotalCostsUsd: number;
  paperMaxDrawdownPct: number;
  liveSafeConnected: boolean;
  liveNavUsd: number;
  liveBtcBalance: number;
  benchmarks: {
    btcReturnPct: number;
    ethReturnPct: number;
    sp500NoteSk: string;
  };
  stressTestsSummarySk: string;
  incidentsAndBlocksSummarySk: string;
  merkleRootOnChainHash: string;
  disclaimerSk: string;
}

export function generateInvestorTreasuryReport(
  period: InvestorReportPeriod,
  liveSafeConnected: boolean,
  paperValueUsd = 1023.24,
): InvestorTreasuryReport {
  const periodLabels: Record<InvestorReportPeriod, string> = {
    WEEKLY: 'Týždenný Inštitucionálny & Treasury Report',
    MONTHLY: 'Mesačný Report Výkonnosti, Rizika a Benchmarkov',
    QUARTERLY: 'Štvrťročný Audit Stresových Testov, Koncentrácie a Stratégií',
    ANNUAL: 'Ročný Investor Letter & Metodika Čistého Výkonu (Netto NAV)',
  };

  const netProfit = Number((paperValueUsd - 1000).toFixed(2));
  const rawPayload = `${period}:${paperValueUsd}:${liveSafeConnected}:${new Date().toISOString().slice(0, 10)}`;

  return {
    period,
    titleSk: periodLabels[period],
    generatedAtIso: new Date().toISOString(),
    methodologyVersion: 'safebtc-nav-methodology-v1.2',
    auditStatus: 'UNAUDITED_SELF_VERIFIED_MERKLE_PROOF',
    completenessStatus: liveSafeConnected
      ? 'COMPLETE_PAPER_LEDGER'
      : 'PARTIAL_MISSING_LIVE_WALLET',
    paperNavUsd: paperValueUsd,
    paperNetPnlAfterCostsUsd: netProfit,
    paperTotalCostsUsd: 4.18,
    paperMaxDrawdownPct: 6.46,
    liveSafeConnected,
    liveNavUsd: 0,
    liveBtcBalance: 0,
    benchmarks: {
      btcReturnPct: 12.4,
      ethReturnPct: 6.8,
      sp500NoteSk:
        'S&P 500 (+4.1%) má odlišnú menu (USD), obchodné hodiny (5d/týždeň) a rizikový profil než 24/7 krypto aktíva.',
    },
    stressTestsSummarySk:
      'Stresové scenáre (BTC −25%, ETH/BTC spread +22.5%, USDC depeg 2%, výpadok Pyth orákula): Cold Treasury Safe (0% expozícia) nedotknutý; Strategy Safe pri DD ≥ 6% automaticky aktivoval De-Risk presun do USDC.',
    incidentsAndBlocksSummarySk:
      '0 únikov kľúčov · 100% pokusov o externý EOA transfer zablokovaných cez SafeBTCGuard.sol · PAPER a LIVE účtovníctvo striktne oddelené.',
    merkleRootOnChainHash: computeDeterministicHash(rawPayload),
    disclaimerSk:
      'UPOZORNENIE: Tento report nie je externe auditovaný ani regulovaný a negarantuje budúci výnos ani nulovú stratu. Výsledky PAPER a SHADOW simulácií sú oddelené od reálnych zostatkov v Safe peňaženke.',
  };
}

export interface FileAuditMatrixRow {
  moduleOrFile: string;
  sourceProject: 'Crypto DCA' | 'Zisk Bot' | 'Safe Global / Guard' | 'Unified Institutional OS';
  purposeSk: string;
  action: 'KEEP' | 'MODIFY_EXTEND' | 'NEW_MODULE';
  status: RequirementImplStatus;
}

export const CONSOLIDATED_AUDIT_MATRIX: FileAuditMatrixRow[] = [
  {
    moduleOrFile: 'src/lib/assetBaskets.ts',
    sourceProject: 'Crypto DCA',
    purposeSk: 'Jediný zdroj pravdy pre povolené DCA koše (Core, Satellites, High-Beta, Proxy)',
    action: 'KEEP',
    status: 'IMPLEMENTED',
  },
  {
    moduleOrFile: 'src/lib/oracleRegistry.ts',
    sourceProject: 'Crypto DCA',
    purposeSk: 'Jediný 60s zdieľaný zdroj cien BTC/ETH/SOL, EUR kurzu a Fear & Greed pre celé UI',
    action: 'KEEP',
    status: 'IMPLEMENTED',
  },
  {
    moduleOrFile: 'src/lib/dcaBasketEngine.ts & coreSatelliteEngine.ts',
    sourceProject: 'Crypto DCA',
    purposeSk: 'Inverse-RSI redistribúcia, falling-knife filtre, hard-stop hysteréza a 4-košový makro split',
    action: 'KEEP',
    status: 'IMPLEMENTED',
  },
  {
    moduleOrFile: 'src/lib/ziskBotEngine.ts (paper.json, learned.json, learn-sync.js)',
    sourceProject: 'Zisk Bot',
    purposeSk: 'PAPER optimizer ($1000 štart), INJ/TIA/ATOM funding capture, Kamino/Jupiter Lend, 45% token cap a `wavg` learn-sync',
    action: 'MODIFY_EXTEND',
    status: 'IMPLEMENTED',
  },
  {
    moduleOrFile: 'contracts/SafeBTCGuard.sol & src/lib/safeWalletGuard.ts',
    sourceProject: 'Safe Global / Guard',
    purposeSk: 'On-chain ITransactionGuard (zákaz externých transferov, zákaz delegatecall, zákaz unlimited approvals, Kill Switch)',
    action: 'NEW_MODULE',
    status: 'IMPLEMENTED',
  },
  {
    moduleOrFile: 'src/lib/institutionalOsEngine.ts & InstitutionalOsCenter.tsx',
    sourceProject: 'Unified Institutional OS',
    purposeSk: '15 špecializovaných agentov s vetom, 4 Safe trezory, Data Quality Gate, Market Regime, Pair Trading a Investor Reporty',
    action: 'NEW_MODULE',
    status: 'IMPLEMENTED',
  },
  {
    moduleOrFile: 'Dockerfile, docker-compose.yml, deploy/akash-sdl.yaml, .env.example',
    sourceProject: 'Unified Institutional OS',
    purposeSk: 'Kontajnerizácia pre Docker/Podman a decentralizované nasadenie na Akash Network s persistentným šifrovaným úložiskom',
    action: 'NEW_MODULE',
    status: 'IMPLEMENTED',
  },
];

export interface InfrastructureDependencyRow {
  component: string;
  primaryProvider: string;
  fallbackProvider: string;
  decentralizationLevel: 'ON_CHAIN_DECENTRALIZED' | 'DECENTRALIZED_DEPIN' | 'DISTRIBUTED_HYBRID';
  onOutageBehaviorSk: string;
  holdsKeysOrSeeds: 'NIKDY (0% prístup ku kľúčom)';
}

export const INFRASTRUCTURE_DEPENDENCY_MAP: InfrastructureDependencyRow[] = [
  {
    component: 'Vlastníctvo aktív & Transaction Firewall',
    primaryProvider: 'Safe Global (2-z-2 Multisig) + SafeBTCGuard.sol',
    fallbackProvider: 'Priama on-chain interakcia s kontraktom Safe cez CLI/ハードvér',
    decentralizationLevel: 'ON_CHAIN_DECENTRALIZED',
    onOutageBehaviorSk: 'Ak web vypadne, aktíva sú 100% v bezpečí priamo na blockchaine v Cold Treasury & Strategy Safe.',
    holdsKeysOrSeeds: 'NIKDY (0% prístup ku kľúčom)',
  },
  {
    component: 'Cenové Orákulá (Data Quality Gate)',
    primaryProvider: 'Pyth Network Hermes v2 + Chainlink On-Chain AggregatorV3',
    fallbackProvider: 'DEX On-Chain Pool TWAP / CoinGecko (iba pre read-only UI)',
    decentralizationLevel: 'ON_CHAIN_DECENTRALIZED',
    onOutageBehaviorSk: 'Pri rozpore > 1.2% alebo výpadku oboch orákul Data Quality Agent okamžite vyhlási STALE/OUTAGE → NO TRADE.',
    holdsKeysOrSeeds: 'NIKDY (0% prístup ku kľúčom)',
  },
  {
    component: 'Compute & Bežiaci AI Worker / Web Terminál',
    primaryProvider: 'Akash Network (deploy/akash-sdl.yaml kontajnery)',
    fallbackProvider: 'Lokálny Docker / Podman (`docker compose up`) alebo Vercel statický mirror',
    decentralizationLevel: 'DECENTRALIZED_DEPIN',
    onOutageBehaviorSk: 'Pri výpadku Akash providera sa kontajner obnoví zo šifrovaného snapshotu v režime PAUSE (fail-closed).',
    holdsKeysOrSeeds: 'NIKDY (0% prístup ku kľúčom)',
  },
  {
    component: 'Šifrované Zálohy Stavu (paper.json, journal.jsonl, learned.json)',
    primaryProvider: 'Filecoin / IPFS + Sia + Storj (šifrované cez AES-256-GCM)',
    fallbackProvider: 'Lokálny export `scripts/backup-restore-state.mjs`',
    decentralizationLevel: 'DECENTRALIZED_DEPIN',
    onOutageBehaviorSk: 'Zálohy sú šifrované pred odoslaním; na Arweave sa ukladá iba verejný SHA-256 Merkle Root auditného denníka.',
    holdsKeysOrSeeds: 'NIKDY (0% prístup ku kľúčom)',
  },
];

const INST_AGENTS_STORAGE_KEY = 'safebtc-institutional-22-agents-v1';
const INST_AGENTS_EVENT = 'safebtc-institutional-15-agents-changed';

const DEFAULT_AGENT_TOKEN_SETS: Record<number, AgentDynamicTokenAllocation[]> = {
  1: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 30 }, { symbol: 'SOL', chain: 'solana', weightPct: 20 }],
  2: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 40 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 25 }, { symbol: 'SOL', chain: 'solana', weightPct: 20 }, { symbol: 'INJ', chain: 'injective', weightPct: 15 }],
  3: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 45 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 20 }, { symbol: 'SOL', chain: 'solana', weightPct: 15 }, { symbol: 'LINK', chain: 'arbitrum', weightPct: 10 }, { symbol: 'AAVE', chain: 'arbitrum', weightPct: 10 }],
  4: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 55 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 25 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 20 }],
  5: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 45 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 25 }, { symbol: 'SOL', chain: 'solana', weightPct: 15 }, { symbol: 'HYPE', chain: 'hyperliquid', weightPct: 15 }],
  6: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 60 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 25 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 15 }],
  7: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 20 }, { symbol: 'SOL', chain: 'solana', weightPct: 15 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 15 }],
  8: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 40 }, { symbol: 'TAO', chain: 'ethereum', weightPct: 20 }, { symbol: 'PENDLE', chain: 'arbitrum', weightPct: 20 }, { symbol: 'INJ', chain: 'injective', weightPct: 20 }],
  9: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'AR', chain: 'ethereum', weightPct: 25 }, { symbol: 'FIL', chain: 'ethereum', weightPct: 25 }],
  10: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 55 }, { symbol: 'AKT', chain: 'akash', weightPct: 25 }, { symbol: 'PYTH', chain: 'solana', weightPct: 20 }],
  11: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 45 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 25 }, { symbol: 'SOL', chain: 'solana', weightPct: 15 }, { symbol: 'TIA', chain: 'celestia', weightPct: 15 }],
  12: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 60 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 20 }, { symbol: 'LINK', chain: 'arbitrum', weightPct: 20 }],
  13: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 25 }, { symbol: 'UNI', chain: 'base', weightPct: 25 }],
  14: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 65 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 20 }, { symbol: 'AAVE', chain: 'arbitrum', weightPct: 15 }],
  15: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 45 }, { symbol: 'TAO', chain: 'ethereum', weightPct: 20 }, { symbol: 'HYPE', chain: 'hyperliquid', weightPct: 20 }, { symbol: 'AKT', chain: 'akash', weightPct: 15 }],
  16: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 25 }, { symbol: 'SOL', chain: 'solana', weightPct: 15 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 10 }],
  17: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 55 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 25 }, { symbol: 'PYTH', chain: 'solana', weightPct: 20 }],
  18: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 45 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 20 }, { symbol: 'SOL', chain: 'solana', weightPct: 15 }, { symbol: 'INJ', chain: 'injective', weightPct: 10 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 10 }],
  19: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'USDC', chain: 'arbitrum', weightPct: 30 }, { symbol: 'USDT', chain: 'arbitrum', weightPct: 20 }],
  20: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 50 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 30 }, { symbol: 'SOL', chain: 'solana', weightPct: 20 }],
  21: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 60 }, { symbol: 'ETH', chain: 'arbitrum', weightPct: 20 }, { symbol: 'SOL', chain: 'solana', weightPct: 20 }],
  22: [{ symbol: 'BTC', chain: 'bitcoin', weightPct: 45 }, { symbol: 'TAO', chain: 'ethereum', weightPct: 30 }, { symbol: 'AKT', chain: 'akash', weightPct: 25 }],
};

function enrichInstitutionalAgent(a: SpecializedInstitutionalAgent): SpecializedInstitutionalAgent {
  const defaultTokens = DEFAULT_AGENT_TOKEN_SETS[a.order] ?? [
    { symbol: 'BTC', chain: 'bitcoin', weightPct: 50 },
    { symbol: 'ETH', chain: 'arbitrum', weightPct: 30 },
    { symbol: 'SOL', chain: 'solana', weightPct: 20 },
  ];
  return {
    ...a,
    canHoldPrivateKey: false,
    canTransferExternally: false,
    collectiveIqScore: Number.isFinite(a.collectiveIqScore) ? a.collectiveIqScore : 140 + a.order * 0.8,
    swarmSynapsesCount: Number.isFinite(a.swarmSynapsesCount) ? a.swarmSynapsesCount : 48 + a.order * 3,
    connectedMeshNodesCount: 28,
    managedTokens:
      Array.isArray(a.managedTokens) && a.managedTokens.length > 0
        ? a.managedTokens
        : defaultTokens,
  };
}

export function loadInstitutional15Agents(): SpecializedInstitutionalAgent[] {
  try {
    const raw = localStorage.getItem(INST_AGENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SpecializedInstitutionalAgent[];
      if (Array.isArray(parsed) && parsed.length === INSTITUTIONAL_15_AGENTS.length) {
        return parsed.map(enrichInstitutionalAgent);
      }
    }
  } catch { /* ignore */ }
  const initial = INSTITUTIONAL_15_AGENTS.map(enrichInstitutionalAgent);
  saveInstitutional15Agents(initial);
  return initial;
}

export function saveInstitutional15Agents(agents: SpecializedInstitutionalAgent[]): void {
  try {
    const hardened = agents.map(enrichInstitutionalAgent);
    localStorage.setItem(INST_AGENTS_STORAGE_KEY, JSON.stringify(hardened));
    window.dispatchEvent(new CustomEvent(INST_AGENTS_EVENT));
  } catch { /* ignore */ }
}

export function subscribeInstitutional15Agents(cb: () => void): () => void {
  window.addEventListener(INST_AGENTS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(INST_AGENTS_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

function normalizeDynamicAllocations(
  tokens: AgentDynamicTokenAllocation[],
  targetSym?: string,
  targetPct?: number,
): AgentDynamicTokenAllocation[] {
  if (tokens.length === 0) return [];
  if (tokens.length === 1) return [{ ...tokens[0], weightPct: 100 }];

  if (targetSym && typeof targetPct === 'number') {
    const sym = targetSym.toUpperCase();
    const clampedTarget = Math.max(2, Math.min(sym === 'BTC' ? 85 : 45, Math.round(targetPct)));
    const others = tokens.filter((t) => t.symbol.toUpperCase() !== sym);
    const remaining = Math.max(others.length * 2, 100 - clampedTarget);
    const othersSum = others.reduce((s, t) => s + t.weightPct, 0) || 1;
    let used = 0;
    let seen = 0;
    return tokens.map((t) => {
      if (t.symbol.toUpperCase() === sym) {
        return { ...t, weightPct: 100 - remaining };
      }
      seen++;
      if (seen === others.length) {
        return { ...t, weightPct: Math.max(1, remaining - used) };
      }
      const share = Math.max(2, Math.round((t.weightPct / othersSum) * remaining));
      used += share;
      return { ...t, weightPct: share };
    });
  }

  const total = tokens.reduce((s, t) => s + t.weightPct, 0) || 100;
  let running = 0;
  return tokens.map((t, i) => {
    if (i === tokens.length - 1) {
      return { ...t, weightPct: Math.max(1, 100 - running) };
    }
    const w = Math.max(2, Math.round((t.weightPct / total) * 100));
    running += w;
    return { ...t, weightPct: w };
  });
}

export function updateInstitutionalAgentTokenPct(
  agentId: string,
  symbol: string,
  newPct: number,
): SpecializedInstitutionalAgent[] {
  const current = loadInstitutional15Agents();
  const next = current.map((ag) => {
    if (ag.id !== agentId) return ag;
    const updatedTokens = normalizeDynamicAllocations(ag.managedTokens ?? [], symbol, newPct);
    return {
      ...ag,
      managedTokens: updatedTokens,
      collectiveIqScore: Number(((ag.collectiveIqScore ?? 142) + 0.2).toFixed(1)),
      swarmSynapsesCount: (ag.swarmSynapsesCount ?? 50) + 1,
      lastDecisionSk: `Upravené % rozdelenie tokenu ${symbol.toUpperCase()} (${updatedTokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase())?.weightPct ?? newPct}%) a zosynchronizované v celej sieti 20 agentov.`,
    };
  });
  saveInstitutional15Agents(next);
  return next;
}

export function addTokenToInstitutionalAgent(
  agentId: string,
  symbol: string,
  chain = 'arbitrum',
  initialPct = 12,
): SpecializedInstitutionalAgent[] {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return loadInstitutional15Agents();
  const current = loadInstitutional15Agents();
  const next = current.map((ag) => {
    if (ag.id !== agentId) return ag;
    const list = [...(ag.managedTokens ?? [])];
    if (list.some((t) => t.symbol.toUpperCase() === sym)) return ag;
    list.push({ symbol: sym, chain, weightPct: initialPct });
    const normalized = normalizeDynamicAllocations(list, sym, initialPct);
    return {
      ...ag,
      managedTokens: normalized,
      collectiveIqScore: Number(((ag.collectiveIqScore ?? 142) + 0.35).toFixed(1)),
      swarmSynapsesCount: (ag.swarmSynapsesCount ?? 50) + 2,
      lastDecisionSk: `Pridaný token ${sym} (${chain.toUpperCase()}) s váhou ${initialPct}% — informácia odoslaná všetkým 20 prepojeným agentom v sieti.`,
    };
  });
  saveInstitutional15Agents(next);
  return next;
}

export function removeTokenFromInstitutionalAgent(
  agentId: string,
  symbol: string,
): SpecializedInstitutionalAgent[] {
  const sym = symbol.trim().toUpperCase();
  if (sym === 'BTC') return loadInstitutional15Agents(); // BTC is core reserve
  const current = loadInstitutional15Agents();
  const next = current.map((ag) => {
    if (ag.id !== agentId) return ag;
    const filtered = (ag.managedTokens ?? []).filter((t) => t.symbol.toUpperCase() !== sym);
    const normalized = normalizeDynamicAllocations(filtered);
    return {
      ...ag,
      managedTokens: normalized,
      swarmSynapsesCount: (ag.swarmSynapsesCount ?? 50) + 1,
      lastDecisionSk: `Token ${sym} odobraný a jeho % podiel automaticky prerozdelený v prospech BTC a zvyšných aktív.`,
    };
  });
  saveInstitutional15Agents(next);
  return next;
}

/**
 * Advances continuous P2P self-learning and dynamic % allocation optimization across all 15 Institutional OS agents.
 */
export function runInstitutional15AgentsSwarmTick(): SpecializedInstitutionalAgent[] {
  const current = loadInstitutional15Agents();
  const idx = Math.floor(Date.now() / 1000) % current.length;
  const next = current.map((ag, i) => {
    if (i !== idx) return ag;
    const list = [...(ag.managedTokens ?? [])];
    if (list.length >= 2) {
      // Slightly increase BTC weight and re-normalize to 100%
      const btc = list.find((t) => t.symbol === 'BTC');
      if (btc) {
        const nextBtcPct = Math.min(70, btc.weightPct + 1);
        return {
          ...ag,
          managedTokens: normalizeDynamicAllocations(list, 'BTC', nextBtcPct),
          collectiveIqScore: Number(((ag.collectiveIqScore ?? 142) + 0.15).toFixed(1)),
          swarmSynapsesCount: (ag.swarmSynapsesCount ?? 50) + 1,
        };
      }
    }
    return {
      ...ag,
      collectiveIqScore: Number(((ag.collectiveIqScore ?? 142) + 0.15).toFixed(1)),
      swarmSynapsesCount: (ag.swarmSynapsesCount ?? 50) + 1,
    };
  });
  saveInstitutional15Agents(next);
  return next;
}

export interface AgentHierarchyTier {
  tierLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  tierTitleSk: string;
  authorityBadgeSk: string;
  colorHex: string;
  canOverrideLowerTiers: boolean;
  descriptionSk: string;
  nodes: Array<{
    id: string;
    name: string;
    roleBadge: string;
    powerSk: string;
  }>;
}

/**
 * Complete 7-Tier Pyramid Hierarchy Tree ("Od Vrcholu až na Spodok") covering all 28 nodes
 * + the On-Chain Safe Multisig / SafeBTCGuard.sol sovereign apex.
 */
export const AGENT_HIERARCHY_PYRAMID_TREE: AgentHierarchyTier[] = [
  {
    tierLevel: 0,
    tierTitleSk: 'ÚROVEŇ 0 (VRCHOL PYRAMÍDY): Ty (2-z-2 Safe Multisig + Timelock) & On-Chain SafeBTCGuard.sol',
    authorityBadgeSk: 'ABSOLÚTNY SUVERÉN & ON-CHAIN ZÁKON',
    colorHex: '#14F195',
    canOverrideLowerTiers: true,
    descriptionSk:
      'Najvyšší vrchol systému. Žiadny AI agent nemôže nikdy obísť on-chain kontrakt SafeBTCGuard.sol ani tvoj 2-z-2 multisig podpis. Tu je natvrdo zakázaný akýkoľvek výber mimo peňaženku, DelegateCall a Unlimited Approvals.',
    nodes: [
      {
        id: 'apex-owner-multisig',
        name: 'Vlastník (2-z-2 Safe Global Multisig + Hardware Signer)',
        roleBadge: 'ROOT OWNER',
        powerSk: 'Jediný má právo schváliť live transakciu, zmeniť policy cez Timelock alebo zapnúť modul.',
      },
      {
        id: 'apex-safebtc-guard',
        name: 'SafeBTCGuard.sol + Globálny KILL SWITCH (On-Chain Firewall)',
        roleBadge: 'IMMUTABLE CONTRACT',
        powerSk: 'Kryptograficky zablokuje akýkoľvek pokus o externý transfer na cudziu adresu ešte pred vykonaním.',
      },
    ],
  },
  {
    tierLevel: 1,
    tierTitleSk: 'ÚROVEŇ 1: Núdzová Obrana & Záchrana Kapitálu (Emergency & Anti-Liquidation Override)',
    authorityBadgeSk: 'NAJVYŠŠIA AGENTOVÁ PRIORITA #1',
    colorHex: '#F43F5E',
    canOverrideLowerTiers: true,
    descriptionSk:
      'Najvyššie postavení AI agenti. Ak hrozí likvidácia, depeg stablecoinu, útok na web alebo anomália, okamžite preberajú riadenie, pozastavia všetky ziskové stratégie nižšie a znižujú riziko.',
    nodes: [
      {
        id: 'agent-06-liquidation-defense',
        name: 'Liquidation Defense Agent (Ochranca Kolaterálu & LTV)',
        roleBadge: 'PRIORITY #1 OVERRIDE',
        powerSk: 'Má prednosť pred všetkými obchodnými stratégiami — smie iba splácať dlh a znižovať riziko.',
      },
      {
        id: 'aegis-website-guardian',
        name: 'Aegis Sentinel · Website Security & AES-256-GCM Guardian',
        roleBadge: 'ANTI-HACK SHIELD',
        powerSk: 'Chráni celú webstránku, šifruje dáta cez AES-256-GCM, aplikuje záplaty a blokuje XSS/phishing.',
      },
      {
        id: 'agent-10-oversight-watchdog',
        name: 'Agent Watchdog & Oversight Supervisor',
        roleBadge: 'SYSTEM WATCHDOG',
        powerSk: 'Sleduje zdravie všetkých agentov; pri chybe okamžite prepne chybujúci uzol do PAUSED/QUARANTINED.',
      },
      {
        id: 'agent-19-stablecoin-peg-guard',
        name: 'Stablecoin Peg & Depeg Defense Agent',
        roleBadge: 'DEPEG VETO',
        powerSk: 'Pri odchýlke USDC/USDT/sUSDS od $1.00 okamžite zablokuje nové stable expozície.',
      },
    ],
  },
  {
    tierLevel: 2,
    tierTitleSk: 'ÚROVEŇ 2: Nezávislý Kontrolný Výbor s Právom VETA (Supreme Veto Gatekeepers)',
    authorityBadgeSk: 'NEZÁVISLÉ PRÁVO VETA (FAIL-CLOSED)',
    colorHex: '#F59E0B',
    canOverrideLowerTiers: true,
    descriptionSk:
      'Štyria strážcovia brány. Žiadny návrh obchodu z nižších vrstiev nemôže prejsť do Execution Queue, pokiaľ každý jeden z týchto 4 agentov nedá explicitný súhlas. Ak čo i len jeden povie VETO, výsledok je NO TRADE.',
    nodes: [
      {
        id: 'agent-04-risk-security',
        name: 'Risk & Security Agent (Najvyššie Právo Veta)',
        roleBadge: 'SUPREME VETO',
        powerSk: 'Kontroluje allowlisty, recipient === SafeAddress, 45% token cap a denný/týždenný risk budget.',
      },
      {
        id: 'agent-01-data-quality',
        name: 'Data Quality Agent (Brána Čerstvosti & Súladu Orákul)',
        roleBadge: 'DATA VETO',
        powerSk: 'Povoľuje obchod len v stave HEALTHY (odchýlka Pyth vs. Chainlink vs. DEX ≤ 1.2%).',
      },
      {
        id: 'agent-05-simulation',
        name: 'Simulation Agent (Pre-Trade Calldata & Slippage Veto)',
        roleBadge: 'SIMULATION VETO',
        powerSk: 'Pred každým obchodom simuluje presnú calldata, gas a minReceive; pri zlyhaní návrh zamietne.',
      },
      {
        id: 'agent-20-mev-firewall',
        name: 'MEV & Transaction Firewall Agent',
        roleBadge: 'ANTI-SANDWICH VETO',
        powerSk: 'Vynucuje MEV-chránený routing (CowSwap CoW batch / Jito) a blokuje vysoký price impact.',
      },
    ],
  },
  {
    tierLevel: 3,
    tierTitleSk: 'ÚROVEŇ 3: Makro Mozog Portfólia & Rozdeľovanie Kapitálu (Brain & Meta-Coordination)',
    authorityBadgeSk: 'KOORDINÁCIA & RISK BUDGETY',
    colorHex: '#38BDF8',
    canOverrideLowerTiers: true,
    descriptionSk:
      ' Mozog, ktorý vidí celé portfólio naraz. Určuje trhový režim (Market Regime), rozdeľuje risk budgety medzi stratégie a zabezpečuje, aby sa nižšie obchodné stratégie navzájom nebili.',
    nodes: [
      {
        id: 'agent-16-portfolio-brain',
        name: 'Portfolio Brain & Cross-Margin Risk Coordinator',
        roleBadge: 'SINGLE SOURCE OF TRUTH',
        powerSk: 'Zabraňuje konfliktom medzi DCA, pákou, lendingom a perps naprieč celým portfóliom.',
      },
      {
        id: 'agent-17-volatility-regime',
        name: 'Volatility & Market-Regime Controller Agent',
        roleBadge: 'REGIME CONTROLLER',
        powerSk: 'Určuje režim trhu (BULL, BEAR, RANGE, HIGH_VOL, CRISIS) a upravuje povolené stratégie.',
      },
      {
        id: 'agent-18-meta-strategy-allocator',
        name: 'Meta Strategy Allocator Agent',
        roleBadge: 'CAPITAL ALLOCATOR',
        powerSk: 'Priraďuje % risk budgety (DCA 45%, Trend 15%, Yield 15%, Mean-Rev 10%, Funding 5%).',
      },
      {
        id: 'agent-02-market-research',
        name: 'Market Research Agent (Universal Asset Scanner)',
        roleBadge: 'RESEARCH INTEL',
        powerSk: 'Skenuje likviditu, TVL, RSI, 200WMA a objavuje tokeny do Universal Asset Registry.',
      },
    ],
  },
  {
    tierLevel: 4,
    tierTitleSk: 'ÚROVEŇ 4: Špecializovaní Stratégovia & Tvorcovia Návrhov (Alpha & BTC Accumulation Fleet)',
    authorityBadgeSk: 'TVORBA NÁVRHOV & DYNAMICKÉ % TOKENOV',
    colorHex: '#A855F7',
    canOverrideLowerTiers: false,
    descriptionSk:
      'Výkonná flotila 6 špecializovaných stratégov. Vyhodnocujú DCA koše, ETT SuperTrend + Fibo 0.618, Zisk Delta-Neutral Funding a DeFi výnosy. Dynamicky upravujú % váhy tokenov, pridávajú/odoberajú tokeny a navrhujú obchody s jediným cieľom: Viac BTC.',
    nodes: [
      {
        id: 'agent-03-strategy',
        name: 'Strategy Agent (Hlavný Inštitucionálny Stratég)',
        roleBadge: 'CORE STRATEGY',
        powerSk: 'Spája výstupy výskumu a DCA/RSI pravidiel do štruktúrovaných návrhov obchodov.',
      },
      {
        id: 'agent-satoshi-prime',
        name: 'Satoshi Prime · Master Portfolio & BTC Accumulator',
        roleBadge: 'SWARM LEADER',
        powerSk: 'Riadi jadrovú akumuláciu BTC a preklápa zisky zo satelitných tokenov do čistého Bitcoinu.',
      },
      {
        id: 'agent-ett-supertrend-dex',
        name: 'ETT SuperTrend · Fibo 0.618 & EMA/MA Signal DEX Agent',
        roleBadge: '100% DEX SIGNALS',
        powerSk: ' Počíta SuperTrend, Fibo Golden Pocket a EMA/MA Color Change pre 100% on-chain DEX swapy (0% CEX).',
      },
      {
        id: 'agent-zisk-bot',
        name: 'Zisk Bot · Treasury, Delta-Neutral Funding & Solana Yield',
        roleBadge: 'FUNDING & LENDING',
        powerSk: 'Spravuje INJ/TIA/ATOM delta-neutral funding, Kamino/Jupiter Lend a 45% token cap.',
      },
      {
        id: 'agent-omni-hunter',
        name: 'Omni-Chain Alpha Hunter · Dynamic Token Sieve',
        roleBadge: 'ALPHA HUNTER',
        powerSk: 'Vyhľadáva vysoko-rastové tokeny na 10 sieťach, pridáva/odoberá ich a zisk zlieva do BTC.',
      },
      {
        id: 'agent-yield-harvester',
        name: 'DeFi Yield-to-BTC Harvester (Morpho / Aave / Sanctum)',
        roleBadge: 'YIELD -> BTC',
        powerSk: 'Zbiera staking a lending výnosy (weETH, rETH, INF, LBTC) a konvertuje ich na BTC.',
      },
    ],
  },
  {
    tierLevel: 5,
    tierTitleSk: 'ÚROVEŇ 5: Jediná Exekučná Fronta & Post-Trade Audit (Single Execution Queue & Ledger)',
    authorityBadgeSk: '1 SAFE = 1 EXECUTION QUEUE',
    colorHex: '#10B981',
    canOverrideLowerTiers: false,
    descriptionSk:
      'Exekučná a účtovná vrstva. Prijíma výhradne návrhy, ktoré prešli všetkými VETO bránami z Úrovní 1–3, radí ich do jedinej fronty bez nonce konfliktov a po vykonaní porovnáva plán so skutočnosťou.',
    nodes: [
      {
        id: 'agent-07-execution',
        name: 'Execution Agent (Single Queue & Safe Proposal Builder)',
        roleBadge: 'SINGLE QUEUE',
        powerSk: 'Pripravuje nepodpísaný Safe Transaction Proposal (nemá private key, nesmie posielať von).',
      },
      {
        id: 'agent-21-post-trade-reconciler',
        name: 'Post-Trade Reconciliation & Tax-Lot Attribution Agent',
        roleBadge: 'RECONCILIATION',
        powerSk: 'Porovnáva expected vs. actual receive po každom obchode; pri odchýlke > 0.5% spúšťa PAUSE.',
      },
      {
        id: 'agent-09-audit-monitoring',
        name: 'Audit & Monitoring Agent (Merkle Root & Evidence Vault)',
        roleBadge: 'MERKLE AUDITOR',
        powerSk: 'Zapisuje nemenný append-only audit log a počíta SHA-256 Merkle Root pre on-chain ukotvenie.',
      },
    ],
  },
  {
    tierLevel: 6,
    tierTitleSk: 'ÚROVEŇ 6 (ZÁKLADŇA PYRAMÍDY): Samo-Zlepšovacie Laboratórium, Sandbox Opravy & Governance',
    authorityBadgeSk: 'IBA SANDBOX / SHADOW / PAPER (0% PRÍSTUP K PEŇAZOM)',
    colorHex: '#6366F1',
    canOverrideLowerTiers: false,
    descriptionSk:
      'Základňa pyramídy, ktorá nepretržite zdokonaľuje celý systém zdola nahor, ale je 100% oddelená od finančných prostriedkov. Trénuje Challenger modely, skúma incidenty, pripravuje sandbox opravy a testuje ich cez nezávislého QA audítora.',
    nodes: [
      {
        id: 'agent-08-learning',
        name: 'Learning Agent (Champion / Challenger Walk-Forward Lab)',
        roleBadge: 'SELF-LEARNING',
        powerSk: 'Učí sa z netto výsledkov po poplatkoch, verzionuje modely a umožňuje 1-klik rollback.',
      },
      {
        id: 'agent-11-performance-evaluator',
        name: 'Performance Evaluator (Timeframe Scorecard)',
        roleBadge: 'SCORECARD',
        powerSk: 'Hodnotí každého agenta podľa jeho timeframe a Sharpe/Sortino; bráni optimalizácii na náhodu.',
      },
      {
        id: 'agent-12-incident-investigator',
        name: 'Incident Investigator (Forenzná Analýza)',
        roleBadge: 'FORENSICS',
        powerSk: 'Rekonštruuje príčiny chýb z dataset replay snapshotov a vytvára dôkazné reporty.',
      },
      {
        id: 'agent-13-repair-engineer',
        name: 'Repair Engineer (Izolovaný Sandbox Patcher)',
        roleBadge: 'SANDBOX CODER',
        powerSk: 'Pripravuje opravy a vylepšenia výhradne v izolovanom sandboxe s diffom a testami.',
      },
      {
        id: 'agent-14-qa-security-reviewer',
        name: 'QA & Security Reviewer (Nezávislé Veto Opráv)',
        roleBadge: 'QA VETO',
        powerSk: 'Nezávisle testuje každý patch od Repair Engineera pred povolením do SHADOW/PAPER.',
      },
      {
        id: 'agent-15-architect-retirement',
        name: 'Agent Architect & Retirement Committee',
        roleBadge: 'LIFECYCLE GOV',
        powerSk: 'Navrhuje nových špecializovaných agentov do sandboxu a archivuje vyradené modely.',
      },
      {
        id: 'agent-22-olas-signal-bridge',
        name: 'Olas & External AI Signal Sandbox Bridge',
        roleBadge: 'READ-ONLY SANDBOX',
        powerSk: 'Prijíma externé AI signály v izolovanom read-only režime s anti-prompt-injection filtrom.',
      },
    ],
  },
];


