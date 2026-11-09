import { createPublicClient, http, fallback, parseAbi, formatUnits, hexToString, type Address, type Chain } from 'viem';
import { arbitrum, base, optimism, mainnet, gnosis } from 'viem/chains';

/**
 * Universal reader: any oracle-verified BTC-pegged collateral and USD/EUR stable debt
 * of one smart wallet across Aave V3, Spark, Compound V3, Morpho Blue and Maker/Sky.
 */
export const RPCS: Record<string, { chain: Chain; urls: string[] }> = {
  Arbitrum: { chain: arbitrum, urls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'] },
  Base: { chain: base, urls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'] },
  Optimism: { chain: optimism, urls: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'] },
  Ethereum: { chain: mainnet, urls: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'] },
  Gnosis: { chain: gnosis, urls: ['https://rpc.gnosischain.com', 'https://gnosis-rpc.publicnode.com'] },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem readContract typing clashes with this TS version
const clients: Record<string, any> = {};
const client = (net: string) =>
  (clients[net] ??= createPublicClient({ chain: RPCS[net].chain, transport: fallback(RPCS[net].urls.map(u => http(u))) }));

/** Aave-v3-style pools (Aave + Spark): every listed reserve is scanned, not a fixed token list. */
const LENDING_POOLS: { protocol: string; chain: string; pool: Address }[] = [
  { protocol: 'Aave V3', chain: 'Arbitrum', pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' },
  { protocol: 'Aave V3', chain: 'Optimism', pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' },
  { protocol: 'Aave V3', chain: 'Base', pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' },
  { protocol: 'Aave V3', chain: 'Ethereum', pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' },
  { protocol: 'Spark', chain: 'Ethereum', pool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987' },
  { protocol: 'Spark', chain: 'Gnosis', pool: '0x2Dae5307c5E3FD1CF5A72Cb6F698f915860607e0' },
];
/** Compound V3 Comets; collateral list + base token are read on-chain. */
const COMETS: { chain: string; comet: Address }[] = [
  { chain: 'Arbitrum', comet: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf' },
  { chain: 'Arbitrum', comet: '0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07' },
  { chain: 'Ethereum', comet: '0xc3d688B66703497DAA19211EEdff47f25384cdc3' },
  { chain: 'Ethereum', comet: '0x3Afdc9BCA9213A35503b2FF6Cf62b4aA4E9c4dCF' },
  { chain: 'Base', comet: '0xb125E6687d4313864e53df431d5425969c15Eb2F' },
];
const MORPHO_CHAINS: [string, number][] = [['Ethereum', 1], ['Base', 8453], ['Arbitrum', 42161], ['Optimism', 10]];

const poolAbi = parseAbi([
  'function getReservesList() view returns (address[])',
  'function ADDRESSES_PROVIDER() view returns (address)',
  'function getReserveData(address) view returns ((uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,address,address,address,address,uint128,uint128,uint128))',
]);
const providerAbi = parseAbi(['function getPriceOracle() view returns (address)']);
const oracleAbi = parseAbi(['function getAssetPrice(address) view returns (uint256)']);
export const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const cometAbi = parseAbi([
  'function numAssets() view returns (uint8)',
  'function getAssetInfo(uint8) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 a, uint64 b, uint64 c, uint128 d))',
  'function getPrice(address) view returns (uint256)',
  'function collateralBalanceOf(address,address) view returns (uint128)',
  'function baseToken() view returns (address)',
  'function baseTokenPriceFeed() view returns (address)',
  'function borrowBalanceOf(address) view returns (uint256)',
]);
const getCdpsAbi = parseAbi(['function getCdpsAsc(address,address) view returns (uint256[] ids, address[] urns, bytes32[] ilks)']);
const vatAbi = parseAbi(['function urns(bytes32,address) view returns (uint256 ink, uint256 art)', 'function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)']);

export type PegKind = 'BTC' | 'ETH' | 'USD' | 'EUR';
export type CollateralKind = 'BTC' | 'ETH';
export interface PegRefs { btcUsd: number; eurUsd: number; ethUsd?: number }
/** ETH family: native/wrapped 1:1, liquid-staking tokens (wstETH, rETH, cbETH…) trade at a 0.95–1.35× ETH exchange rate. */
const nearEth = (p: number, eth?: number) => !!eth && eth > 0 && p / eth >= 0.95 && p / eth <= 1.35;
const PEG_TOLERANCE = 0.05;
const near = (a: number, b: number) => b > 0 && Math.abs(a / b - 1) <= PEG_TOLERANCE;

/**
 * Universal recognition: BTC-named tokens count only if the oracle price is ~1:1 with BTC;
 * USD/EUR stables only if the oracle price is ~1 USD or ~1 EUR.
 */
export function classifyAsset(symbol: string, oraclePriceUsd: number, refs: PegRefs): PegKind | null {
  const s = symbol.toUpperCase();
  if (s.includes('BTC')) return near(oraclePriceUsd, refs.btcUsd) ? 'BTC' : null;
  if (s.includes('ETH') && !/USD|EUR/.test(s)) return nearEth(oraclePriceUsd, refs.ethUsd) ? 'ETH' : null;
  if (/EUR|€/.test(s)) return near(oraclePriceUsd, refs.eurUsd) ? 'EUR' : null;
  // Universal USD pattern: anything carrying a dollar-stable identifier (USD*, *USD, DAI, FRAX, GHO, DOLA, MIM, BOLD, ...).
  if (/USD|\$|DAI|FRAX|GHO|DOLA|MIM|BOLD|RAI|MAI|USX|PYUSD|RLUSD/.test(s)) return near(oraclePriceUsd, 1) ? 'USD' : null;
  // Unnamed liabilities: accept by oracle alone with a tight 1% band (never ETH/SOL etc.).
  if (oraclePriceUsd > 0 && Math.abs(oraclePriceUsd - 1) <= 0.01) return 'USD';
  if (refs.eurUsd > 0 && oraclePriceUsd > 0 && Math.abs(oraclePriceUsd / refs.eurUsd - 1) <= 0.01) return 'EUR';
  return null;
}

export interface BtcCollateralEntry { protocol: string; chain: string; asset: string; amountBtc: number }
export interface StableDebtEntry { protocol: string; chain: string; asset: string; peg: 'USD' | 'EUR'; amount: number; amountUsd: number }
export interface MultiProtocolBtcResult {
  entries: BtcCollateralEntry[]; debts: StableDebtEntry[]; failed: string[];
  totalDepositedBtcAcrossAllProtocols: number; TotalDebtAcrossAllProtocols: number;
}

export const sumBtcCollateral = (entries: BtcCollateralEntry[]) => entries.reduce((s, e) => s + (e.amountBtc > 0 ? e.amountBtc : 0), 0);
export const sumStableDebtUsd = (debts: StableDebtEntry[]) => debts.reduce((s, d) => s + (d.amountUsd > 0 ? d.amountUsd : 0), 0);
/** Multi-protocol LTV = total stable debt (USD) / total BTC collateral value (USD). */
export const multiProtocolLtv = (collateralBtc: number, btcUsd: number, debtUsd: number) =>
  collateralBtc > 0 && btcUsd > 0 ? debtUsd / (collateralBtc * btcUsd) : debtUsd > 0 ? Infinity : 0;

type Out = { col: BtcCollateralEntry[]; debt: StableDebtEntry[] };

export async function fetchMultiProtocolBtc(user: Address, refs: PegRefs, target: CollateralKind = 'BTC'): Promise<MultiProtocolBtcResult> {
  const stable = (p: PegKind | null | undefined): p is 'USD' | 'EUR' => p === 'USD' || p === 'EUR';
  // ETH module: LST amounts are converted to ETH-equivalent via the oracle exchange rate.
  const units = (amt: number, priceUsd: number) => (target === 'ETH' && refs.ethUsd ? amt * priceUsd / refs.ethUsd : amt);
  const jobs: { label: string; run: () => Promise<Out> }[] = [];
  const pegUsd = (peg: PegKind, amt: number) => (peg === 'EUR' ? amt * refs.eurUsd : amt);

  for (const p of LENDING_POOLS) {
    jobs.push({ label: `${p.protocol} ${p.chain}`, run: async () => {
      const c = client(p.chain);
      const [reserves, provider] = await Promise.all([
        c.readContract({ address: p.pool, abi: poolAbi, functionName: 'getReservesList' }) as Promise<Address[]>,
        c.readContract({ address: p.pool, abi: poolAbi, functionName: 'ADDRESSES_PROVIDER' }) as Promise<Address>,
      ]);
      const oracle = await c.readContract({ address: provider, abi: providerAbi, functionName: 'getPriceOracle' }) as Address;
      const meta = await c.multicall({ allowFailure: true, contracts: reserves.flatMap(a => [
        { address: a, abi: erc20Abi, functionName: 'symbol' },
        { address: a, abi: erc20Abi, functionName: 'decimals' },
        { address: oracle, abi: oracleAbi, functionName: 'getAssetPrice', args: [a] },
        { address: p.pool, abi: poolAbi, functionName: 'getReserveData', args: [a] },
      ]) });
      const rows = reserves.map((a, i) => ({ a, sym: meta[i * 4].result as string, dec: Number(meta[i * 4 + 1].result ?? 18), price: Number(meta[i * 4 + 2].result ?? 0n) / 1e8, rd: meta[i * 4 + 3].result as any }))
        .filter(r => r.sym && r.rd).map(r => ({ ...r, peg: classifyAsset(r.sym, r.price, refs) })).filter(r => r.peg);
      const bals = await c.multicall({ allowFailure: true, contracts: rows.flatMap(r => [
        { address: r.rd[8], abi: erc20Abi, functionName: 'balanceOf', args: [user] },
        { address: r.rd[10], abi: erc20Abi, functionName: 'balanceOf', args: [user] },
      ]) });
      const out: Out = { col: [], debt: [] };
      rows.forEach((r, i) => {
        const supplied = Number(formatUnits((bals[i * 2].result as bigint) ?? 0n, r.dec));
        const borrowed = Number(formatUnits((bals[i * 2 + 1].result as bigint) ?? 0n, r.dec));
        if (r.peg === target && supplied > 0) out.col.push({ protocol: p.protocol, chain: p.chain, asset: r.sym, amountBtc: units(supplied, r.price) });
        if (stable(r.peg) && borrowed > 0) out.debt.push({ protocol: p.protocol, chain: p.chain, asset: r.sym, peg: r.peg as 'USD' | 'EUR', amount: borrowed, amountUsd: pegUsd(r.peg!, borrowed) });
      });
      return out;
    } });
  }
  for (const m of COMETS) {
    jobs.push({ label: `Compound V3 ${m.chain}`, run: async () => {
      const c = client(m.chain);
      const n = Number(await c.readContract({ address: m.comet, abi: cometAbi, functionName: 'numAssets' }));
      const infos = await c.multicall({ allowFailure: false, contracts: Array.from({ length: n }, (_, i) => ({ address: m.comet, abi: cometAbi, functionName: 'getAssetInfo', args: [i] })) }) as any[];
      const [base, baseFeed, borrowed] = await Promise.all([
        c.readContract({ address: m.comet, abi: cometAbi, functionName: 'baseToken' }) as Promise<Address>,
        c.readContract({ address: m.comet, abi: cometAbi, functionName: 'baseTokenPriceFeed' }) as Promise<Address>,
        c.readContract({ address: m.comet, abi: cometAbi, functionName: 'borrowBalanceOf', args: [user] }) as Promise<bigint>,
      ]);
      const assets = [...infos.map(x => ({ asset: x.asset as Address, feed: x.priceFeed as Address })), { asset: base, feed: baseFeed }];
      const meta = await c.multicall({ allowFailure: true, contracts: assets.flatMap(x => [
        { address: x.asset, abi: erc20Abi, functionName: 'symbol' },
        { address: x.asset, abi: erc20Abi, functionName: 'decimals' },
        { address: m.comet, abi: cometAbi, functionName: 'getPrice', args: [x.feed] },
      ]) });
      const out: Out = { col: [], debt: [] };
      const btcInfos = infos.map((x, i) => ({ x, sym: meta[i * 3].result as string, dec: Number(meta[i * 3 + 1].result ?? 18), price: Number(meta[i * 3 + 2].result ?? 0n) / 1e8 }))
        .filter(r => r.sym && classifyAsset(r.sym, r.price, refs) === target);
      const cb = await c.multicall({ allowFailure: true, contracts: btcInfos.map(r => ({ address: m.comet, abi: cometAbi, functionName: 'collateralBalanceOf', args: [user, r.x.asset] })) });
      btcInfos.forEach((r, i) => { const v = Number(formatUnits((cb[i].result as bigint) ?? 0n, r.dec)); if (v > 0) out.col.push({ protocol: 'Compound V3', chain: m.chain, asset: r.sym, amountBtc: units(v, r.price) }); });
      const bi = n * 3; const bSym = meta[bi].result as string; const bDec = Number(meta[bi + 1].result ?? 6);
      const bPeg = bSym ? classifyAsset(bSym, Number(meta[bi + 2].result ?? 0n) / 1e8, refs) : null;
      const debt = Number(formatUnits(borrowed, bDec));
      if (stable(bPeg) && debt > 0) out.debt.push({ protocol: 'Compound V3', chain: m.chain, asset: bSym, peg: bPeg, amount: debt, amountUsd: pegUsd(bPeg, debt) });
      return out;
    } });
  }
  for (const [chain, chainId] of MORPHO_CHAINS) {
    jobs.push({ label: `Morpho ${chain}`, run: async () => {
      const r = await fetch('https://blue-api.morpho.org/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ userByAddress(address:"${user}", chainId:${chainId}) { marketPositions { state { collateral borrowAssets } market { collateralAsset { symbol decimals priceUsd: price { usd } } loanAsset { symbol decimals priceUsd: price { usd } } } } } }` }),
      });
      const j = await r.json();
      if (j.errors?.some((e: { message?: string }) => !/not found/i.test(e.message ?? ''))) throw new Error('morpho');
      const out: Out = { col: [], debt: [] };
      for (const p of j.data?.userByAddress?.marketPositions ?? []) {
        const ca = p.market?.collateralAsset; const la = p.market?.loanAsset;
        if (ca && classifyAsset(ca.symbol ?? '', Number(ca.priceUsd?.usd ?? 0), refs) === target) {
          const v = Number(p.state?.collateral ?? 0) / 10 ** (ca.decimals ?? 8);
          if (v > 0) out.col.push({ protocol: 'Morpho', chain, asset: ca.symbol, amountBtc: units(v, Number(ca.priceUsd?.usd ?? 0)) });
        }
        const lp = la ? classifyAsset(la.symbol ?? '', Number(la.priceUsd?.usd ?? 0), refs) : null;
        if (stable(lp)) {
          const d = Number(p.state?.borrowAssets ?? 0) / 10 ** (la.decimals ?? 6);
          if (d > 0) out.debt.push({ protocol: 'Morpho', chain, asset: la.symbol, peg: lp, amount: d, amountUsd: pegUsd(lp, d) });
        }
      }
      return out;
    } });
  }
  jobs.push({ label: 'Maker/Sky Ethereum', run: async () => {
    const c = client('Ethereum');
    const VAT = '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B';
    const [, urns, ilks] = await c.readContract({ address: '0x36a724Bd100c39f0Ea4D3A20F7097eE01A8Ff573', abi: getCdpsAbi, functionName: 'getCdpsAsc', args: ['0x5ef30b9986345249bc32d8928B7ee64DE9435E39', user] });
    const out: Out = { col: [], debt: [] };
    for (let i = 0; i < urns.length; i++) {
      const ilk = hexToString(ilks[i], { size: 32 }).replace(/\0/g, '');
      const [ink, art] = await c.readContract({ address: VAT, abi: vatAbi, functionName: 'urns', args: [ilks[i], urns[i]] });
      const [, rate] = await c.readContract({ address: VAT, abi: vatAbi, functionName: 'ilks', args: [ilks[i]] });
      // Maker BTC ilks are priced by the protocol's own BTC oracle (OSM).
      if ((target === 'BTC' ? /BTC/i : /ETH/i).test(ilk) && ink > 0n) out.col.push({ protocol: 'Maker/Sky', chain: 'Ethereum', asset: ilk, amountBtc: Number(formatUnits(ink, 18)) });
      const dai = Number(formatUnits(BigInt(art) * BigInt(rate), 45));
      if (dai > 0) out.debt.push({ protocol: 'Maker/Sky', chain: 'Ethereum', asset: 'DAI', peg: 'USD', amount: dai, amountUsd: dai });
    }
    return out;
  } });

  const settled = await Promise.allSettled(jobs.map(j => j.run()));
  const entries: BtcCollateralEntry[] = [];
  const debts: StableDebtEntry[] = [];
  const failed = new Set<string>();
  let ok = 0;
  settled.forEach((r, i) => { if (r.status === 'fulfilled') { ok++; entries.push(...r.value.col); debts.push(...r.value.debt); } else failed.add(jobs[i].label); });
  if (!ok) throw new Error('Žiadny protokol nie je dostupný');
  for (const l of [...failed]) if (settled.some((r, i) => jobs[i].label === l && r.status === 'fulfilled')) failed.delete(l);
  return {
    entries, debts, failed: [...failed],
    totalDepositedBtcAcrossAllProtocols: sumBtcCollateral(entries),
    TotalDebtAcrossAllProtocols: sumStableDebtUsd(debts),
  };
}

/** Well-known USD/EUR stablecoin contracts per chain for the free Fiat Buffer scan. */
const WALLET_STABLES: { chain: string; token: Address; peg: 'USD' | 'EUR' }[] = [
  { chain: 'Arbitrum', token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', peg: 'USD' }, // USDC
  { chain: 'Arbitrum', token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', peg: 'USD' }, // USDT
  { chain: 'Arbitrum', token: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', peg: 'USD' }, // DAI
  { chain: 'Arbitrum', token: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', peg: 'USD' }, // USDC.e
  { chain: 'Base', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', peg: 'USD' }, // USDC
  { chain: 'Base', token: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', peg: 'USD' }, // DAI
  { chain: 'Base', token: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', peg: 'EUR' }, // EURC
  { chain: 'Optimism', token: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', peg: 'USD' }, // USDC
  { chain: 'Optimism', token: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', peg: 'USD' }, // USDT
  { chain: 'Optimism', token: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', peg: 'USD' }, // DAI
  { chain: 'Ethereum', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', peg: 'USD' }, // USDC
  { chain: 'Ethereum', token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', peg: 'USD' }, // USDT
  { chain: 'Ethereum', token: '0x6B175474E89094C44Da98b954EedeAC495271d0F', peg: 'USD' }, // DAI
  { chain: 'Ethereum', token: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c', peg: 'EUR' }, // EURC
];

export interface StableBalanceEntry { chain: string; asset: string; peg: 'USD' | 'EUR'; amount: number; amountUsd: number }

/**
 * Free (unallocated) USD/EUR stablecoins sitting directly in the smart wallet —
 * the Fiat Buffer. EUR balances are converted to USD at the live EUR rate.
 * An empty wallet strictly returns 0.
 */
export async function fetchStableBalances(user: Address, refs: PegRefs): Promise<{ entries: StableBalanceEntry[]; totalUsd: number }> {
  const byChain = new Map<string, typeof WALLET_STABLES>();
  for (const s of WALLET_STABLES) byChain.set(s.chain, [...(byChain.get(s.chain) ?? []), s]);
  const jobs = [...byChain.entries()].map(([chain, list]) => async () => {
    const c = client(chain);
    const meta = await c.multicall({ allowFailure: true, contracts: list.flatMap(s => [
      { address: s.token, abi: erc20Abi, functionName: 'balanceOf', args: [user] },
      { address: s.token, abi: erc20Abi, functionName: 'symbol' },
      { address: s.token, abi: erc20Abi, functionName: 'decimals' },
    ]) });
    const out: StableBalanceEntry[] = [];
    list.forEach((s, i) => {
      const dec = Number(meta[i * 3 + 2].result ?? (s.token === '0xdAC17F958D2ee523a2206206994597C13D831ec7' ? 6 : 18));
      const amt = Number(formatUnits((meta[i * 3].result as bigint) ?? 0n, dec));
      if (amt <= 0) return;
      const sym = (meta[i * 3 + 1].result as string) ?? (s.peg === 'EUR' ? 'EURC' : 'USD');
      out.push({ chain, asset: sym, peg: s.peg, amount: amt, amountUsd: s.peg === 'EUR' ? amt * refs.eurUsd : amt });
    });
    return out;
  });
  const settled = await Promise.allSettled(jobs.map(j => j()));
  const entries = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  return { entries, totalUsd: entries.reduce((s, e) => s + e.amountUsd, 0) };
}
