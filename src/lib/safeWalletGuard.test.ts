import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSafeAddressInput,
  validateAgentTransactionWithSafeGuard,
  DEFAULT_SAFE_GUARD_POLICY,
  saveSafeSession,
  loadSafeSession,
  type ProposedAgentTransaction,
} from './safeWalletGuard';
import {
  DEFAULT_AUTONOMOUS_AGENTS,
  createNewAutonomousAgent,
  runAutonomousAgentCycle,
  testForbiddenExternalWithdrawalBlock,
} from './autonomousAgentEngine';
import {
  DECENTRALIZED_PROTOCOLS,
  generateAkashDeploySdl,
  createDecentralizedSnapshotBundle,
} from './decentralizedInfra';

const SAFE_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const EXTERNAL_ATTACKER = '0xDeadBeef00000000000000000000000000009999';

describe('Safe{Wallet} Global Guard & Autonomous BTC Agent Architecture', () => {
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

    // Even if an agent disguises a swap to send output tokens to an external address, Guard blocks it
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

    // Run learning cycle -> increases BTC balance and learning generation inside the Safe
    const { updatedAgent, logEntry } = runAutonomousAgentCycle(futureAgent, SAFE_ADDR, {
      BTC: 75000,
      ETH: 2200,
      SOL: 90,
    });
    expect(logEntry.guardVerdict.allowed).toBe(true);
    expect(logEntry.recipientAddress).toBe(SAFE_ADDR);
    expect(updatedAgent.learningGeneration).toBe(futureAgent.learningGeneration + 1);
    expect(updatedAgent.accumulatedBtc).toBeGreaterThan(futureAgent.accumulatedBtc);

    // Test forbidden external withdrawal block helper
    const blockedLog = testForbiddenExternalWithdrawalBlock(updatedAgent, SAFE_ADDR, EXTERNAL_ATTACKER);
    expect(blockedLog.guardVerdict.allowed).toBe(false);
    expect(blockedLog.btcAcquired).toBe(0);
  });

  it('persists SafeSession with immutable Zodiac Guard flags and provides decentralized Web3 manifests', async () => {
    saveSafeSession({
      safeAddress: SAFE_ADDR,
      primaryChain: 'arbitrum',
      enabledChains: ['arbitrum', 'ethereum', 'solana', 'bitcoin'],
      connectedVia: 'safe_walletconnect',
      onChainVerified: true,
      threshold: 2,
      ownersCount: 3,
      zodiacRolesGuardActive: true,
      guardPolicy: DEFAULT_SAFE_GUARD_POLICY,
      connectedAt: Date.now(),
    });

    const loaded = loadSafeSession();
    expect(loaded?.safeAddress).toBe(SAFE_ADDR);
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
});
