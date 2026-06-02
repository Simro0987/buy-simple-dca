
# Master System Integration

Tento plán prepojí všetky moduly (Portfolio, DCA, Swap, Stake) do jednej synchronizovanej entity. Rozdelený do 4 fáz podľa zadania. Manuálne hardware-wallet workflow ostáva zachovaný — žiadne auto-execution.

## Fáza 1 — Portfolio & Rebalancing Master Upgrade

1. **Smart Rebalancing Advisor v Portfolio**
   - Pridať komponent `SmartRebalanceAdvisor.tsx` priamo k `AllocationDonut` v `PortfolioPage.tsx`.
   - Vstup: `metrics.assets` z `usePortfolio()` s cieľom 64/25/11.
   - Ak `|deviationPct| > 5` pre ktorýkoľvek asset → zobraziť žltý warning blok „💡 NAVRHOVANÉ REBALANSOVANIE PORTFÓLIA" s konkrétnymi USD sumami na presun.
   - Tlačidlo „✅ Potvrdiť vykonanie rebalansovania" → naviguje na `/?tab=swap` a uloží `pendingRebalance` do `sessionStorage` (overweight → underweight páry).

2. **Swap auto-populate**
   - `SwapPage` / `SwapCrossChainCard` pri mount-e prečíta `pendingRebalance` a predvyplní formulár (from/to/amount). Po načítaní zmaže záznam.

3. **Smart Manual Accumulator** (v `InitialHoldingsCard`)
   - Pridať toggle: `[Presná suma assetu]` ↔ `[Celková USD suma]`.
   - V USD móde: `newQty = usdAmount / currentPrice`.
   - Logika prírastku: `totalQty = oldQty + newQty`, `avgPrice = (oldQty*oldAvg + newQty*priceUsed) / totalQty`.
   - Zápis do `app_settings.manual_holdings` + `app_settings.initial_cost_basis` (oba ako USD basis).
   - Po `save()` invalidovať `useAppSettings` query → okamžitý re-render charts/P&L/basis.

## Fáza 2 — Cross-Module Synchronization

1. **Centralizovaný `PortfolioProvider`** už existuje v `src/contexts/PortfolioContext.tsx`. Treba ho:
   - Obaliť celú appku v `App.tsx` (momentálne tam nie je) → jednotný master state.
   - Pridať helpery `addPurchase(symbol, qty, priceUsd)` a `recordStake(symbol, qty)` ktoré:
     - aktualizujú `manual_holdings` + `initial_cost_basis` cez `useAppSettings.update`,
     - emitujú event pre re-render.

2. **DCA → Portfolio**
   - V `dca-execute` confirm flowe (frontend handler po `status: FILLED`) zavolať `addPurchase()`.
   - V `DynamicExecutionCard` / `ExecutionPlanCard` po manuálnom potvrdení market buy → rovnaký volania.

3. **Stake → Portfolio**
   - `breakdown` v `PortfolioContext` už počíta `stakedValue`. V `AllocationDonut` rozšíriť segmenty na `BTC`, `BTC [Staked]`, `ETH`, `ETH [Staked]`, `SOL`, `SOL [Staked]` (rozdelené farby tej istej hue, staked = poloprehľadné).

4. **Swap/DCA → Stake quick-link**
   - Po úspešnom DCA/Swap (Toast + inline panel) zobraziť `💰 Presunúť do STAKE` tlačidlo → naviguje na `/?tab=stake` s query `?prefill=ETH:0.05`.
   - `StakingPage` prečíta query a predvyplní amount.

## Fáza 3 — Visual Sanitization & Money Mode

1. **Native ticker enforcement**
   - Vytvoriť `src/lib/tickerLabels.ts`: `export const nativeTicker = (s: string) => s.replace(/^(cb|w)/i, '').replace(/^WETH$/i,'ETH').replace(/^WSOL$/i,'SOL').replace(/^CBBTC$/i,'BTC');`
   - `rg "cbBTC|wETH|WETH|cbBTC|wSOL"` cez celý `src/` a obaliť všetky display stringy do `nativeTicker()`. Internal token mapping (Base L2 routing) ostáva.

2. **Dynamic Take Profit + Money Mode**
   - V `DynamicTakeProfitCard` importovať `useMarketCycle` (alebo z `PortfolioContext`).
   - Ak `regime === 'PARABOLIC'` alebo `score >= 80` → pridať červený glow border + badge „⚠️ PARABOLIC — Trh je prepálený, zváž take-profit".

## Fáza 4 — Data Integrity & Wallet Security

1. **Immutable baseline**
   - V `useAppSettings` pri prvom load-e overiť, že `manual_holdings` obsahuje BTC 0.01746423, ETH 0.23278498, SOL 2.60983568 — ak nie, NIČ neprepisovať (žiadny migration). Len log warning.
   - Pridať read-only badge „🔒 Baseline chránená" v `InitialHoldingsCard`.

2. **Strict Manual Policy**
   - Žiadny modul nesmie volať `addPurchase`/`recordStake` bez explicitného user click-u. Audit:
     - DCA market buy → `onClick={confirmMarketBuy}` button (už existuje).
     - Swap → `onClick={confirmSwap}` button.
     - Stake → `onClick={confirmStake}` button.
   - Žiadny `useEffect` nesmie volať tieto helpery — pridať komentár `// MANUAL ONLY — never call from effect`.

3. **Stateless updates**
   - Všetky form inputy ostávajú riadené lokálnym `useState`; mutácie idú cez React Query mutation s `optimistic update` ale `isolated` (žiadny layout shift).
   - Pridať `flushSync` len kde treba; inak `startTransition` pre veľké re-rendre.

## Technické detaily

- **Súbory na vytvorenie:**
  - `src/components/portfolio/SmartRebalanceAdvisor.tsx`
  - `src/lib/tickerLabels.ts`
  - `src/lib/pendingActions.ts` (sessionStorage helpers pre rebalance/stake prefill)

- **Súbory na úpravu:**
  - `src/App.tsx` — obaliť `PortfolioProvider`
  - `src/contexts/PortfolioContext.tsx` — pridať `addPurchase`, `recordStake`
  - `src/pages/PortfolioPage.tsx` — vložiť `SmartRebalanceAdvisor`
  - `src/pages/SwapPage.tsx` + `SwapCrossChainCard.tsx` — prečítať pending rebalance
  - `src/pages/StakingPage.tsx` — prečítať query prefill
  - `src/components/settings/InitialHoldingsCard.tsx` — toggle + weighted-avg
  - `src/components/dashboard/AllocationDonut.tsx` — staked segmenty
  - `src/components/portfolio/DynamicTakeProfitCard.tsx` — Money Mode glow
  - `src/components/dca/DynamicExecutionCard.tsx` + `ExecutionPlanCard.tsx` — confirm → addPurchase + Stake quick-link
  - Všetky komponenty so „cbBTC/WETH/WSOL" → `nativeTicker()`

- **Žiadne DB migrácie** — všetko funguje na existujúcej schéme (`app_settings`, `dca_purchases`).
- **Žiadne auto-chainovanie** — každý cross-module hop je samostatný user gesture + nová route.

## Mimo rozsahu

- Reálne hardware-wallet podpisovanie (mimo aplikácie — užívateľ podpisuje vo svojej peňaženke).
- Auto-fetch staking balances on-chain (riešené existujúcim `stakeRoutingService`).
- Refactor DB schémy.

Po schválení začnem fázou 1 a budem reportovať postup po každej fáze.
