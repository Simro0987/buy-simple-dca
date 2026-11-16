# Ochrana prostriedkov: čo AI agenti môžu a nemôžu

**Cieľ:** AI agenti nesmú nikdy poslať krypto na inú adresu ako tvoj vlastný Safe.

## 1. Ako je to dnes (stav kódu po tejto zmene)

| Vec | Stav |
|---|---|
| Privátne kľúče / seed v repozitári, v `.env`, v Docker image | **Žiadne.** Prehľadaná celá git história (1705 commitov): nájdený len verejný Supabase *anon/publishable* kľúč (je verejný z princípu, je aj v JS buildu). |
| Môžu agenti v appke podpísať alebo odoslať transakciu? | **Nie.** Appka nemá žiadny kľúč a žiadnu cestu, ako transakciu vykonať. „Agenti“ (`autonomousAgentEngine`, `institutionalOsEngine`, `ziskBotEngine`, …) bežia v prehliadači ako simulácia / odporúčania (PAPER). `submitSafeAppTransactionBatch()` sa nikde nevolá a po oprave už ani nenavrhuje prázdnu „placeholder“ transakciu. |
| Off-chain kontrola `validateAgentTransactionWithSafeGuard()` | Existuje a bola sprísnená (blokuje `transfer`, `transferFrom`, `safeTransferFrom`, `permit`, `setApprovalForAll`, `execTransaction`, `multiSend`, zmeny vlastníkov/guardu/modulov …, príjemca musí byť Safe, fail-closed na neplatné sumy). **Je to len JavaScript v prehliadači – nie bezpečnostná hranica.** Kto ovláda prehliadač/kód, obíde ju. Skutočná ochrana musí byť on-chain. |
| Dnešná on-chain ochrana | **Tvoj Safe multisig.** Bez tvojho podpisu sa nič nepohne. |
| Pôvodný `contracts/SafeBTCGuard.sol` | **Odstránený – bol nebezpečný.** Viď nižšie. |

### Prečo bol `SafeBTCGuard.sol` odstránený
Bol napísaný ako Safe **Guard**, ktorý kontroluje *každú* transakciu Safe – aj tvoje vlastné:
1. Blokoval akýkoľvek `transfer` a akékoľvek poslanie ETH → **ani ty by si si nemohol vybrať vlastné peniaze.**
2. Blokoval každú transakciu s `to == safe`, teda aj `setGuard(0)` → **guard by sa už nikdy nedal odstrániť.**
3. `activateEmergencyKillSwitch()` → všetko revertuje navždy, nie je žiadny unpause → **Safe zamrznutý natrvalo.**
4. Nekontroloval `recipient` v swape → povolený router mohol poslať výstup na akúkoľvek adresu (presne to, čomu mal zabrániť).
5. `checkTransaction` mohol volať ktokoľvek → útočník mohol míňať denný limit / cooldown (DoS).
6. Neimplementoval ERC-165 `supportsInterface` → Safe ≥ 1.3.0 by `setGuard` aj tak odmietol (GS300).
7. Limit approve porovnával so sumou vo wei natívnej meny – nezmyselné jednotky pre tokeny.

## 2. Ako dať agentom obchodovanie bezpečne: `contracts/AgentSwapModule.sol`

Namiesto guardu je to **modul** s jedinou úzkou schopnosťou. Agent dostane **vlastný nový kľúč**
(nikdy nie kľúč vlastníka, nikdy nie je vlastníkom Safe) a ten kľúč smie volať jedinú funkciu:

```
swapExactInputSingle(tokenIn, tokenOut, fee, amountIn, amountOutMinimum)
```

Čo platí on-chain (testované v `contracts/test/AgentSwapModule.t.sol`, `forge test` → 12/12):

- **Žiadne prevody von.** Agent nedodáva žiadne calldata. Modul sám zostaví len `token.approve(router, presná_suma)` a
  `router.exactInputSingle(...)` s **`recipient = Safe` natvrdo**. `value = 0`, len `CALL`, nikdy `DELEGATECALL`.
- Router je **immutable** (Uniswap V3 SwapRouter02).
- Len **povolené tokeny** a **povolené pooly** `(tokenIn, tokenOut, fee)` – zabraňuje triku „swapni do môjho prázdneho poolu“.
- **Cenová ochrana:** `amountOutMinimum` musí byť v rámci `maxSlippageBps` od ceny z Chainlinku (staré/záporné ceny → revert).
  Vlastníci nemôžu nastaviť viac ako 5 %.
- **Limity:** max. USD na obchod, max. USD za deň, cooldown medzi obchodmi.
- Approve sa po swape vráti na 0; po swape sa kontrolujú zostatky (ak by router výstup odklonil, celá transakcia revertuje).
- Agent môže modul len **pozastaviť** (`pause`), nie odpauzovať, nemôže meniť tokeny, pooly, limity, agenta, vlastníkov, threshold, guard ani moduly.
- Vlastníci (Safe transakcia) môžu kedykoľvek: `setAgent(0)`, `pause/unpause`, zmeniť limity, alebo modul úplne vypnúť `disableModule` v Safe.

### Čo zostáva ako riziko (úprimne)
- **Kontrakt nie je auditovaný.** Používaj najprv na testnete a potom s malou sumou v oddelenom „Strategy Safe“.
- Skompromitovaný agent kľúč nemôže peniaze ukradnúť, ale môže robiť **zlé obchody** v rámci limitov
  (strata najviac ≈ sklz × denný limit + trhové riziko). Preto malé limity.
- Závislosť na Chainlink orákulách. Na L2 (Arbitrum) doplň kontrolu *Sequencer Uptime Feed* pred ostrým nasadením.
- Ak vlastník povolí škodlivý token alebo zlý feed, ochrana slabne – povoľuj len známe tokeny (WBTC, USDC, WETH…).
- Hlavné BTC drž v **Cold Safe bez akéhokoľvek modulu**. Modul daj iba na Strategy Safe s obmedzenou sumou.

### Nastavenie (TESTNET – Arbitrum Sepolia; mainnet až po review/audite)
Kompletný postup (deploy skript, Transaction Builder JSON, Flux runner) je v **`DEPLOY_FLUX.md` → Časť B**. Skrátene:

1. Vytvor nový kľúč pre agenta (napr. `cast wallet new`) – drž ho len v runner komponente (súbor na Flux volume alebo enterprise env), nikdy v appke/repo/web env.
2. Nasaď modul (adresy routera / feedov si over v oficiálnej dokumentácii Uniswap a data.chain.link pre danú sieť):
   ```bash
   SAFE_ADDRESS=0x.. SWAP_ROUTER=0x.. AGENT_ADDRESS=0x.. PER_SWAP_USD=100 DAILY_USD=300 \
   forge script contracts/script/DeployAgentSwapModule.s.sol:DeployAgentSwapModule \
     --rpc-url $RPC_URL --account deployer --broadcast
   #   skript povolí len testnety (Sepolia, Arbitrum Sepolia, Base Sepolia), mainnet iba s ALLOW_MAINNET=true
   ```
3. V `app.safe.global` → *Transaction Builder* (podpisujú vlastníci) – JSON vygeneruje `npm run runner:safe-tx -- moj-setup.json`:
   - `enableModule(<MODUL>)` na adrese Safe,
   - `setToken(USDC, true, USDC_USD_FEED)`, `setToken(WBTC, true, BTC_USD_FEED)`,
   - `setPool(USDC, WBTC, 500, true)` (a opačný smer, ak chceš aj predávať).
4. Flux komponent `runner` (`agent-runner/`) volá `swapExactInputSingle(...)` svojím kľúčom (gas platí agent kľúč, nie Safe).
   Kód runnera nemá žiadnu inú cestu: nepozná `transfer`, `approve`, `sendTransaction` ani inú cieľovú adresu než modul (overuje to test `agent-runner/test/safety.test.ts`).
5. Vypnutie: `disableModule(prevModule, <MODUL>)` v Safe alebo `setAgent(0x0)`.

Orientačné adresy Arbitrum One (**over pred použitím**): SwapRouter02 `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`,
USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, WBTC `0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f`,
Chainlink BTC/USD `0x6ce185860a4963106506C203335A2910413708e9`, USDC/USD `0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3`.

### Alternatíva: Zodiac Roles Modifier v2 (auditovaný)
Ak nechceš vlastný kontrakt, rovnaké pravidlá sa dajú nastaviť cez https://roles.gnosisguild.org:
rola pre agent kľúč, povolené len `ERC20.approve(spender == router)` na vybraných tokenoch a
`SwapRouter02.exactInputSingle` s podmienkami `tokenIn/tokenOut ∈ {…}`, **`recipient == Avatar (Safe)`**, `fee ∈ {…}`,
plus *allowance* limity. Nevýhoda: Roles nevie porovnať `amountOutMinimum` s cenou orákula (riziko sandwich/zlej ceny v rámci limitu).

### Čo nikdy nerobiť
- Nedávaj agentovi kľúč vlastníka Safe ani ho nepridávaj ako ownera.
- Neinštaluj Guard, ktorý blokuje aj vlastníkov (ako bol pôvodný `SafeBTCGuard`).
- Nedávaj agent kľúč do `.env`, do gitu, do web kontajnera ani do prehliadača. Ani do bežných (nešifrovaných) Flux `environmentParameters` – tie sú verejné.
