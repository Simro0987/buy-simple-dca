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

const SAFE_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const EXTERNAL_ATTACKER = '0xDeadBeef00000000000000000000000000009999';

describe('Safe{Wallet} helpers and client-side agent transaction checks', () => {
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
      appUrl: 'https://buysimpledca.app.runonflux.io',
      wcUri: 'wc:abc123@2?relay-protocol=irn&symKey=def456',
    });

    expect(urls.openAsSafeAppUrl).toContain('https://app.safe.global/apps/open');
    expect(urls.openAsSafeAppUrl).toContain(encodeURIComponent(`arb1:${SAFE_ADDR}`));
    expect(urls.openAsSafeAppUrl).toContain(encodeURIComponent('https://buysimpledca.app.runonflux.io'));
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

  it('persists the Safe session with the self-recipient-only policy', () => {
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

  });
});
