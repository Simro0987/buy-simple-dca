/**
 * Real WalletConnect v2 pairing between this app (dApp side) and Safe{Wallet} (wallet side).
 *
 * How it works: we create a WalletConnect session proposal (needs a free Reown / WalletConnect
 * Cloud project id: https://cloud.reown.com) and show its `wc:` URI as QR / copy text. The user
 * opens their Safe on app.safe.global, clicks the WalletConnect icon in the top bar and pastes
 * the URI. Safe{Wallet} approves the session and exposes the SAFE address (not the owner EOA).
 *
 * The previous implementation generated a random `wc:` string locally. Nothing ever listened
 * on that relay topic, so pairing could never succeed - this was the main "Safe connect does
 * not work" bug.
 *
 * This app only READS through the session. It never requests signatures automatically.
 */
import { runtimeEnv } from '@/lib/runtimeConfig';
import { SAFE_SUPPORTED_CHAINS, type SupportedChainId } from '@/lib/safeWalletGuard';

type WcProvider = Awaited<
  ReturnType<(typeof import('@walletconnect/ethereum-provider'))['EthereumProvider']['init']>
>;

let activeProvider: WcProvider | null = null;

export function getWalletConnectProjectId(): string {
  return runtimeEnv('VITE_WALLETCONNECT_PROJECT_ID').trim();
}

export function isWalletConnectConfigured(): boolean {
  return getWalletConnectProjectId().length >= 8;
}

export interface WalletConnectSafeResult {
  address: string;
  chainIdNumeric: number;
  chain: SupportedChainId | undefined;
  peerName?: string;
}

/**
 * Starts a pairing. `onUri` receives the `wc:` URI to show as QR / copy text.
 * Resolves when Safe{Wallet} approves the session.
 */
export async function connectSafeViaWalletConnect(
  onUri: (uri: string) => void,
): Promise<WalletConnectSafeResult> {
  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new Error('VITE_WALLETCONNECT_PROJECT_ID is not configured');
  }
  await disconnectWalletConnect();

  const evmChains = SAFE_SUPPORTED_CHAINS.filter((c) => c.chainIdNumeric && c.rpcUrl);
  const optionalChains = evmChains.map((c) => c.chainIdNumeric as number);
  const rpcMap = Object.fromEntries(evmChains.map((c) => [c.chainIdNumeric as number, c.rpcUrl as string]));

  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  const provider = await EthereumProvider.init({
    projectId,
    showQrModal: false,
    optionalChains: optionalChains as [number, ...number[]],
    rpcMap,
    optionalMethods: ['eth_accounts', 'eth_chainId', 'eth_sendTransaction', 'personal_sign'],
    optionalEvents: ['chainChanged', 'accountsChanged', 'disconnect'],
    metadata: {
      name: 'buy-simple-dca',
      description: 'Non-custodial DCA terminal (read-only Safe connection)',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
      icons: [
        typeof window !== 'undefined' ? `${window.location.origin}/icon-192.png` : '',
      ].filter(Boolean),
    },
  });
  provider.on('display_uri', (uri: string) => onUri(uri));
  activeProvider = provider;

  await provider.connect();
  const address = provider.accounts?.[0];
  if (!address) throw new Error('Safe{Wallet} did not return an account');
  const chainIdNumeric = Number(provider.chainId);
  const chain = SAFE_SUPPORTED_CHAINS.find((c) => c.chainIdNumeric === chainIdNumeric)?.id;
  const peerName = (provider.session as { peer?: { metadata?: { name?: string } } } | undefined)?.peer
    ?.metadata?.name;
  return { address, chainIdNumeric, chain, peerName };
}

export async function disconnectWalletConnect(): Promise<void> {
  const p = activeProvider;
  activeProvider = null;
  if (!p) return;
  try {
    await p.disconnect();
  } catch {
    /* ignore */
  }
}
