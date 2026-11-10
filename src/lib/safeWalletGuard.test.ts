import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSafeAddressInput,
  validateAgentTransactionWithSafeGuard,
  buildSafeGlobalPortalUrls,
  DEFAULT_SAFE_GUARD_POLICY,
  saveSafeSession,
  loadSafeSession,
  type ProposedAgentTransaction,
} from './safeWalletGuard';
import {
  DEFAULT_AUTONOMOUS_AGENTS,
  createNewAutonomousAgent,
  runAutonomousAgentCycle,
  runContinuousAutonomousFleetTick,
  testForbiddenExternalWithdrawalBlock,
} from './autonomousAgentEngine';
import {
  DECENTRALIZED_PROTOCOLS,
  generateAkashDeploySdl,
  createDecentralizedSnapshotBundle,
} from './decentralizedInfra';
import {
  encryptWithWebCryptoAes256,
  decryptWithWebCryptoAes256,
  runAutonomousWebsiteGuardianScanAndPatch,
  evolveWebsiteUiDesign,
  saveGeminiApiKey,
  loadGeminiApiKey,
  askWebsiteGuardianAi,
} from './websiteGuardianAgent';
import {
  loadZiskBotState,
  runZiskBotAutonomousTick,
  exportZiskLearnedSyncBundle,
  importZiskLearnedSyncBundle,
  ziskWeightedMerge,
} from './ziskBotEngine';
import {
  loadEttSuperTrendState,
  processEttTradingViewSignalOnDex,
  generateEttSuperTrendPineScript,
} from './ettSuperTrendAgent';

const SAFE_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const EXTERNAL_ATTACKER = '0xDeadBeef00000000000000000000000000009999';

describe('100% Non-Custodial Safe{Wallet} Global Guard & Autonomous BTC Agent Architecture', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses Safe Global prefixed addresses (arb1:, eth:, base:) and plain 0x addresses', () => {
    const arb = parseSafeAddressInput(`arb1:${SAFE_ADDR}`);
    expect(arb.valid).toBe(true);
    expect(arb.address).toBe(SAFE_ADDR);
    expect(arb.chain).toBe('arbitrum');

    const eth = parseSafeAddressInput(`eth:${SAFE_ADDR}`);
    expect(eth.valid).toBe(true);
    expect(eth.chain).toBe('ethereum');

    const invalid = parseSafeAddressInput('not-an-address');
    expect(invalid.valid).toBe(false);
  });

  it('builds official app.safe.global Non-Custodial Safe App & WalletConnect URLs', () => {
    const urls = buildSafeGlobalPortalUrls({
      chainId: 'arbitrum',
      safeAddress: SAFE_ADDR,
      appUrl: 'https://buy-simple-dca.vercel.app',
      wcUri: 'wc:abc123@2?relay-protocol=irn&symKey=def456',
    });

    expect(urls.openAsSafeAppUrl).toContain('https://app.safe.global/apps/open');
    expect(urls.openAsSafeAppUrl).toContain(encodeURIComponent(`arb1:${SAFE_ADDR}`));
    expect(urls.openAsSafeAppUrl).toContain(encodeURIComponent('https://buy-simple-dca.vercel.app'));
    expect(urls.openSafeDashboardUrl).toContain('https://app.safe.global/home');
    expect(urls.openSafeDashboardUrl).toContain('wc=');
    expect(urls.openSafeWelcomeUrl).toContain('https://app.safe.global/welcome?chain=arb1');
  });

  it('allows in-wallet DEX swaps and BTC harvesting when recipient === safeAddress', () => {
    const tx: ProposedAgentTransaction = {
      agentId: 'agent-satoshi-prime',
      agentName: 'Satoshi Prime',
      action: 'HARVEST_TO_BTC',
      chain: 'arbitrum',
      fromToken: 'SOL',
      toToken: 'BTC',
      amountUsd: 500,
      recipientAddress: SAFE_ADDR,
      protocol: 'CowSwap (MEV-Protected)',
      methodName: 'swapExactTokensForTokensSelfRecipient',
    };

    const res = validateAgentTransactionWithSafeGuard(tx, SAFE_ADDR, DEFAULT_SAFE_GUARD_POLICY, 50_000);
    expect(res.allowed).toBe(true);
    expect(res.code).toBe('ALLOWED_IN_WALLET_OPERATION');
  });

  it('HARD-BLOCKS any external withdrawal or transfer to another wallet address', () => {
    const externalTx: ProposedAgentTransaction = {
      agentId: 'agent-satoshi-prime',
      agentName: 'Satoshi Prime',
      action: 'EXTERNAL_TRANSFER',
      chain: 'arbitrum',
      fromToken: 'BTC',
      toToken: 'BTC',
      amountUsd: 1000,
      recipientAddress: EXTERNAL_ATTACKER,
      protocol: 'ERC20 Transfer',
      methodName: 'transfer(address,uint256)',
    };

    const res1 = validateAgentTransactionWithSafeGuard(externalTx, SAFE_ADDR);
    expect(res1.allowed).toBe(false);
    expect(res1.code).toBe('BLOCKED_EXTERNAL_TRANSFER_FORBIDDEN');

    const disguisedSwapToExternal: ProposedAgentTransaction = {
      agentId: 'agent-omni-hunter',
      agentName: 'Omni Hunter',
      action: 'SWAP',
      chain: 'ethereum',
      fromToken: 'ETH',
      toToken: 'BTC',
      amountUsd: 500,
      recipientAddress: EXTERNAL_ATTACKER,
      protocol: 'Uniswap V3',
    };

    const res2 = validateAgentTransactionWithSafeGuard(disguisedSwapToExternal, SAFE_ADDR);
    expect(res2.allowed).toBe(false);
    expect(res2.code).toBe('BLOCKED_RECIPIENT_MISMATCH');
  });

  it('enforces non-withdrawal & BTC accumulation on all built-in and newly created future agents', () => {
    for (const agent of DEFAULT_AUTONOMOUS_AGENTS) {
      expect(agent.canWithdrawExternally).toBe(false);
      expect(agent.ultimateObjective).toBe('ACCUMULATE_MORE_BTC');
    }

    const futureAgent = createNewAutonomousAgent({
      name: 'Future DePIN & Bittensor Agent',
      roleSk: 'Spravuje TAO, AR, FIL, PYTH a akumuluje BTC',
      initialTokens: ['BTC', 'TAO', 'AR', 'FIL', 'PYTH'],
    });

    expect(futureAgent.canWithdrawExternally).toBe(false);
    expect(futureAgent.ultimateObjective).toBe('ACCUMULATE_MORE_BTC');
    expect(futureAgent.managedTokens.some((t) => t.symbol === 'TAO')).toBe(true);

    const { updatedAgent, logEntry } = runAutonomousAgentCycle(futureAgent, SAFE_ADDR, {
      BTC: 75000,
      ETH: 2200,
      SOL: 90,
    });
    expect(logEntry.guardVerdict.allowed).toBe(true);
    expect(logEntry.recipientAddress).toBe(SAFE_ADDR);
    expect(updatedAgent.learningGeneration).toBe(futureAgent.learningGeneration + 1);
    expect(updatedAgent.accumulatedBtc).toBeGreaterThan(futureAgent.accumulatedBtc);

    const blockedLog = testForbiddenExternalWithdrawalBlock(updatedAgent, SAFE_ADDR, EXTERNAL_ATTACKER);
    expect(blockedLog.guardVerdict.allowed).toBe(false);
    expect(blockedLog.btcAcquired).toBe(0);
  });

  it('persists Non-Custodial SafeSession with immutable Zodiac Guard flags and provides decentralized Web3 manifests', async () => {
    saveSafeSession({
      safeAddress: SAFE_ADDR,
      owners: ['0x1111111111111111111111111111111111111111'],
      primaryChain: 'arbitrum',
      enabledChains: ['arbitrum', 'ethereum', 'solana', 'bitcoin'],
      connectedVia: 'safe_walletconnect',
      onChainVerified: true,
      nonCustodial: true,
      threshold: 2,
      ownersCount: 3,
      zodiacRolesGuardActive: true,
      guardPolicy: DEFAULT_SAFE_GUARD_POLICY,
      connectedAt: Date.now(),
    });

    const loaded = loadSafeSession();
    expect(loaded?.safeAddress).toBe(SAFE_ADDR);
    expect(loaded?.nonCustodial).toBe(true);
    expect(loaded?.guardPolicy.allowExternalWithdrawals).toBe(false);
    expect(loaded?.guardPolicy.enforceSelfRecipientOnly).toBe(true);
    expect(loaded?.guardPolicy.primaryObjective).toBe('ACCUMULATE_BTC');

    expect(DECENTRALIZED_PROTOCOLS.map((p) => p.id)).toEqual(
      expect.arrayContaining(['pyth', 'chainlink', 'bittensor_tao', 'akash', 'arweave', 'filecoin', 'sia', 'storj']),
    );

    const sdl = generateAkashDeploySdl();
    expect(sdl).toContain('SAFE_GUARD_BLOCK_EXTERNAL_TRANSFERS=true');
    expect(sdl).toContain('PRIMARY_AGENT_GOAL=ACCUMULATE_BTC');

    const snapshot = await createDecentralizedSnapshotBundle();
    expect(snapshot.schemaVersion).toBe('edge-trader-sovereign-v1');
    expect(snapshot.arweaveTxTemplate.startsWith('ar://')).toBe(true);
    expect(snapshot.ipfsCidPreview.startsWith('bafybeig')).toBe(true);
  });

  it('runs Aegis Website Guardian AES-256-GCM encryption, auto-patching, UI evolution & blocks external withdrawals', async () => {
    const secret = 'sensitive-portfolio-and-gemini-api-config';
    const cipher = await encryptWithWebCryptoAes256(secret);
    expect(cipher).toMatch(/^aes256/);
    const plain = await decryptWithWebCryptoAes256(cipher);
    expect(plain).toBe(secret);

    saveGeminiApiKey('AIzaSyTestUserGeminiKey12345');
    expect(loadGeminiApiKey()).toBe('AIzaSyTestUserGeminiKey12345');

    const { state, patchLog, guardSelfTestVerdict } =
      await runAutonomousWebsiteGuardianScanAndPatch();
    expect(state.canWithdrawExternally).toBe(false);
    expect(state.enforcesZeroExternalTransferOnAllAgents).toBe(true);
    expect(state.securityScore).toBe(100);
    expect(guardSelfTestVerdict.allowed).toBe(false);
    expect(patchLog.walletTransferBlocked).toBe(true);

    const evolved = evolveWebsiteUiDesign({
      preset: 'bitcoin_gold',
      addModule: {
        titleSk: 'Anti-MEV Slippage Guard',
        titleEn: 'Anti-MEV Slippage Guard',
        metricLabel: 'Max Slippage',
        metricValue: '0.25%',
      },
    });
    expect(evolved.uiConfig.themePreset).toBe('bitcoin_gold');
    expect(
      evolved.uiConfig.activeCustomModules.some((m) => m.titleSk === 'Anti-MEV Slippage Guard'),
    ).toBe(true);

    const aiRes = await askWebsiteGuardianAi('Skontroluj bezpečnosť a prepni dizajn na zlato');
    expect(aiRes.updatedState.canWithdrawExternally).toBe(false);
    expect(aiRes.reply.length).toBeGreaterThan(20);

    const tickRes = runContinuousAutonomousFleetTick(SAFE_ADDR, { BTC: 75000, ETH: 2200, SOL: 90 }, true);
    expect(tickRes.btcGainedThisTick).toBeGreaterThan(0);
    expect(tickRes.logs.length).toBeGreaterThanOrEqual(4);
    expect(tickRes.agents.some((a) => a.id === 'agent-zisk-bot')).toBe(true);

    // Verify Zisk Bot Engine & `zisk-learned/1` wavg export/import
    const zisk0 = loadZiskBotState();
    expect(zisk0.canWithdrawExternally).toBe(false);
    expect(zisk0.ultimateObjective).toBe('ACCUMULATE_MORE_BTC');
    expect(zisk0.riskLimits.maxTokenCapPct).toBe(45);

    const zisk1 = runZiskBotAutonomousTick(75000);
    expect(zisk1.btcHarvestedFromYieldAndFunding).toBeGreaterThan(zisk0.btcHarvestedFromYieldAndFunding);

    const exported = exportZiskLearnedSyncBundle();
    expect(exported.format).toBe('zisk-learned/1');
    expect(ziskWeightedMerge(0.6, 4, 0.8, 4)).toBeCloseTo(0.7, 3);

    const imported = importZiskLearnedSyncBundle(exported);
    expect(imported.mergedLearnedCount).toBeGreaterThanOrEqual(7);
    expect(imported.mergedSignalsCount).toBeGreaterThanOrEqual(10);

    // Verify ETT SuperTrend + Fibo Zones + EMA/MA Color Signal DEX Agent (Zero CEX / Zero Bitunix)
    const ett0 = loadEttSuperTrendState();
    expect(ett0.cexEliminated).toBe(true);
    expect(ett0.canWithdrawExternally).toBe(false);
    expect(ett0.ultimateObjective).toBe('ACCUMULATE_MORE_BTC');

    const { alertEntry, updatedState: ett1 } = processEttTradingViewSignalOnDex(
      {
        strategy: 'ETT SuperTrend Strategy',
        ticker: 'BTC/USD',
        action: 'BUY',
        timeframe: '4h',
        priceUsd: 75100,
        amountUsd: 300,
      },
      SAFE_ADDR,
      75000,
    );
    expect(alertEntry.guardVerdict.allowed).toBe(true);
    expect(alertEntry.btcAccumulated).toBeGreaterThan(0);
    expect(ett1.totalBtcStackedViaSuperTrend).toBeGreaterThan(ett0.totalBtcStackedViaSuperTrend);

    const pine = generateEttSuperTrendPineScript();
    expect(pine).toContain('ETT SuperTrend');
    expect(pine).toContain('SAFE_GLOBAL_DEX_NO_CEX');
  });
});
