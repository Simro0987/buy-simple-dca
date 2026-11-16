# Nasadenie na Flux (runonflux.io)

Aplikácia je **statická webová aplikácia** (Vite + React). Na Flux beží ako jeden malý
kontajner `nginx` (≈50 MB), ktorý servíruje build na porte **8080**. Žiadne kľúče, žiadna databáza
v kontajneri – Supabase / RPC / Safe sú externé služby.

## Prečo to doteraz nešlo (príčiny)

| # | Problém | Oprava |
|---|---------|--------|
| 1 | **Image nikdy nebol publikovaný.** `ghcr.io/simro0987/buy-simple-dca:latest` neexistuje / nie je verejný (anonymný pull vracia 403), na Docker Hube `simro0987` nemá žiadny repozitár. Flux nody si image musia vedieť stiahnuť **verejne**. | `.github/workflows/docker-publish.yml` buildí a pushuje image. Balík na GHCR treba **raz prepnúť na Public** (GHCR je defaultne private). |
| 2 | **Architektúra.** Image zbuildovaný na Macu s Apple Silicon je `arm64`; Flux nody sú `amd64` → „architecture not supported“. | Workflow a `docker-compose.yml` buildia `linux/amd64`. Ručne: `docker buildx build --platform linux/amd64 ...` |
| 3 | **Neplatná Flux špecifikácia.** Flux v8 povoľuje v komponente len `name, description, repotag, ports, containerPorts, environmentParameters, commands, containerData, domains, repoauth, cpu, ram, hdd` – napr. `tiered`/`secrets` → „Unsupported parameter“. Názov komponentu len `a-z A-Z 0-9`. Verejný port `8080` alebo `<1024` je „enterprise“ port (spoplatnený navyše). | `deploy/flux/flux-app-spec.json` – overené voči zdrojákom FluxOS (`appValidator.js`). Verejný port `37080` → kontajner `8080`. |
| 4 | **Env premenné nefungovali.** `VITE_*` sa do Vite appky „zapečú“ pri builde – `environmentParameters` vo Fluxe za behu nemali žiadny efekt. | Kontajner pri štarte vygeneruje `/env-config.js` (`window.__APP_CONFIG__`) z povoleného zoznamu verejných premenných; appka ich číta cez `src/lib/runtimeConfig.ts`. |
| 5 | **Safe App nefungovala mimo Vercelu.** Safe{Wallet} načíta `manifest.json` cross-origin a appku vkladá do iframe – na Verceli to riešil `vercel.json`, v Docker image (`serve`) tieto hlavičky chýbali. | `deploy/nginx/default.conf`: CORS na `/manifest.json`, `frame-ancestors` pre `app.safe.global`, SPA fallback, `/healthz`. |
| 6 | Kontajner bežal ako `node` s `/data` – Flux mountuje `containerData` ako root → zápis by zlyhal. Appka nič nezapisuje, takže to nie je potrebné. | nginx-unprivileged (uid 101), zapisuje len do `/tmp`; `containerData` je len formálne `/appdata`. |
| 7 | Prázdne `VITE_SUPABASE_URL` → `createClient()` vyhodil chybu → čierna obrazovka. | Bezpečný fallback v `src/integrations/supabase/client.ts`. |

## Zdroje a cena na Fluxe (držané na minime)

Na Fluxe bežia **len 2 malé kontajnery** – žiadna databáza (Postgres/Redis…). Databáza zostáva **mimo Fluxu**
v hostovanom Supabase (zadarmo/lacno), web ju volá priamo z prehliadača. Runner si drží len malý JSON súbor so stavom.

| Komponent | CPU | RAM | SSD | Reálna spotreba (meraná lokálne) |
|---|---|---|---|---|
| `web` (nginx, statické súbory) | 0.1 | 100 MB | 1 GB | ~7 MB RAM, ~0 % CPU |
| `runner` (Node, 1 tick/min) | 0.2 | 200 MB | 1 GB | ~25–80 MB RAM (heap obmedzený na 128 MB) |
| **Spolu** | **0.3** | **300 MB** | **2 GB** | 1 inštancia (`"instances": 1`) |

0.1 CPU / 100 MB / 1 GB je **minimum**, ktoré Flux povolí (`appValidator.js`). Viac inštancií = vyššia cena;
pre web zvýš `instances` až keď treba vyššiu dostupnosť (runner kľúče potom treba nahrať na každú inštanciu).
Stav runnera (`/appdata/agent-runner-state.json`, max. 200 posledných obchodov) má pár desiatok kB.

## Krok za krokom

### 1. Publikuj image (raz, potom automaticky)
0. **Workflow je už aktívny** v `.github/workflows/docker-publish.yml` (spustí sa po merge do `main`).
1. Mergni PR do `main` → GitHub Actions spustí **docker-publish** a pushne dva image:
   `ghcr.io/simro0987/buy-simple-dca:latest` (web) a `ghcr.io/simro0987/buy-simple-dca-agent-runner:latest` (runner),
   oba aj s tagom `:sha-xxxxxxx` (pri git tagu `v1.2.3` aj `:v1.2.3`).
2. Otvor `https://github.com/users/Simro0987/packages/container/buy-simple-dca/settings`
   a `https://github.com/users/Simro0987/packages/container/buy-simple-dca-agent-runner/settings`
   → **Change visibility → Public** (pri oboch; Flux nevie stiahnuť súkromný image).
3. Over (bez prihlásenia): `docker pull ghcr.io/simro0987/buy-simple-dca:latest`
   a `docker buildx imagetools inspect ghcr.io/simro0987/buy-simple-dca:latest` → musí obsahovať `linux/amd64`.

Ručne (bez Actions):
```bash
docker buildx build --platform linux/amd64 -t ghcr.io/simro0987/buy-simple-dca:v1.0.0 --push .
```

### 2. Otestuj lokálne presne to, čo pobeží na Fluxe
```bash
docker compose up -d --build
curl http://localhost:8080/healthz          # ok
curl http://localhost:8080/env-config.js    # window.__APP_CONFIG__ = {...}
curl -I http://localhost:8080/manifest.json # Access-Control-Allow-Origin: *
```

### 3. Zaregistruj appku na Fluxe
1. https://cloud.runonflux.com → **Register New App** → prepni na **JSON/Advanced** (alebo vyplň formulár podľa súboru).
2. Vlož `deploy/flux/flux-app-spec.json`, uprav:
   - `owner` = tvoje **ZelID** (Zelcore / SSP Wallet),
   - `repotag` = ideálne konkrétny tag (`:sha-xxxxxxx` alebo `:v1.0.0`), nie `latest` – Flux potom vie, ktorú verziu stiahnuť pri update,
   - `VITE_WALLETCONNECT_PROJECT_ID=` – voliteľné, zadarmo na https://cloud.reown.com (zapne tlačidlo WalletConnect),
   - `name` musí byť unikátne v celej sieti Flux (ak je obsadené, zmeň napr. na `buysimpledca2`).
3. Podpíš a zaplať (FLUX). Nasadenie trvá zvyčajne 5–15 min.
4. Appka pobeží na `https://<name>.app.runonflux.io` (napr. `https://buysimpledca.app.runonflux.io`).
   Vlastná doména: daj ju do `domains` (`["dca.mojadomena.sk"]`) a nastav DNS podľa Flux dokumentácie.

### 4. Update
Nový commit do `main` → nový image `:sha-…` → vo Flux **Update App** zmeň `repotag` na nový tag
(alebo pri `:latest` použi „Redeploy / Soft redeploy“ v správe appky).

## Premenné prostredia web komponentu (všetky sú VEREJNÉ – nikdy sem nedávaj tajomstvá)

| Premenná | Popis |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Prepíše hodnoty z buildu (`.env`). Publishable/anon kľúč je verejný. |
| `VITE_WALLETCONNECT_PROJECT_ID` | Zapne pripojenie Safe cez WalletConnect. |
| `VITE_SYSTEM_EXECUTION_MODE` | `PAPER` (predvolené). |
| `VITE_DEFAULT_SAFE_CHAIN` | rezervované. |
| `VITE_AGENT_STATUS_URL` | voliteľné – iná URL pre stav runnera (predvolene `./agent-api/status`). |
| `AGENT_STATUS_UPSTREAM` | (nie pre prehliadač) adresa runner komponentu pre nginx proxy, napr. `http://fluxrunner_buysimpledca:8090`. |

Zoznam je v `deploy/nginx/40-runtime-config.sh`; iné premenné sa do prehliadača **nedostanú**.

## Časť B: AI agenti obchodujú sami – druhý Flux komponent `runner`

Celá appka beží na Fluxe ako **jedna appka s dvoma komponentmi** (`deploy/flux/flux-app-spec.json`):

| Komponent | Image | Porty | Čo robí |
|---|---|---|---|
| `web` | `ghcr.io/simro0987/buy-simple-dca` | 37080 → 8080 (verejný) | web appka + read-only proxy `/agent-api/status` |
| `runner` | `ghcr.io/simro0987/buy-simple-dca-agent-runner` | **žiadne verejné** | Node služba, ktorá každú minútu vyhodnotí stratégiu a obchoduje |

### Čo runner smie a nesmie (vynútené kontraktom, nie len kódom)
- Agent kľúč volá **iba** `AgentSwapModule.swapExactInputSingle(...)` (a núdzovo `pause()`) na jednej pevnej adrese modulu.
- Modul pošle výsledok swapu **vždy späť do tvojho Safe** – príjemca je natvrdo `safe`. Výber na inú peňaženku neexistuje.
- Len povolené tokeny a pooly, limit na swap a na deň v USD, cooldown, `minOut` z Chainlink ceny (max 5 % sklz).
- Agent kľúč **nie je** vlastník Safe (runner to overí a odmietne obchodovať, ak by bol).
- Runner nemá žiadny „write“ endpoint – `/status` a `/healthz` sú len na čítanie (GET).
- Predvolene: **testnet** (`arbitrum-sepolia`), **`DRY_RUN=true`** (len simuluje a zapisuje plán), mainnet odmietne bez `ALLOW_MAINNET=true`.
- Pred každým obchodom: kontrola napojenia (preflight), simulácia transakcie, kontrola kill switchu.

### B1. Priprav kľúče (na svojom počítači, nie na Fluxe)
```bash
# nástroje: https://book.getfoundry.sh/getting-started/installation
cast wallet new                      # -> AGENT kľúč (adresa + private key) – len pre runner
cast wallet import deployer --interactive   # tvoj DEPLOYER kľúč na testnet (zašifrovaný keystore)
```
Agent adresa potrebuje trochu **testnet ETH na gas** (faucet pre Arbitrum Sepolia). Safe ani deployer agentovi nič neposielajú.
Každý agent = vlastný kľúč + vlastný modul + vlastné limity.

### B2. Nasaď AgentSwapModule na TESTNET (Arbitrum Sepolia)
Adresy routera a feedov si zober z oficiálnych zdrojov a over ich:
Uniswap v3 SwapRouter02 – https://docs.uniswap.org/contracts/v3/reference/deployments/ ,
Chainlink feedy – https://docs.chain.link/data-feeds/price-feeds/addresses (sieť Arbitrum Sepolia).
```bash
export RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export SAFE_ADDRESS=0x...        # tvoj Safe na Arbitrum Sepolia (app.safe.global -> Create Safe)
export SWAP_ROUTER=0x...         # SwapRouter02 na Arbitrum Sepolia
export AGENT_ADDRESS=0x...       # adresa z `cast wallet new`
export PER_SWAP_USD=100 DAILY_USD=300 COOLDOWN_SECONDS=3600 MAX_SLIPPAGE_BPS=100 MAX_ORACLE_AGE=86400
forge script contracts/script/DeployAgentSwapModule.s.sol:DeployAgentSwapModule \
  --rpc-url $RPC_URL --account deployer --broadcast
```
Skript **odmietne mainnet** (povolené len chain id 11155111, 421614, 84532), overí, že Safe a router sú kontrakty a agent je obyčajná adresa.
Zapíš si adresu modulu z výstupu.

### B3. Zapni modul v Safe (podpisuješ ty ako vlastník)
1. Skopíruj `agent-runner/scripts/safe-setup.example.json` → `moj-setup.json` a doplň `safe`, `module`, tokeny + Chainlink feedy, pooly (fee 500 / 3000).
2. `npm run runner:safe-tx -- moj-setup.json > safe-batch.json` (skript len vypíše JSON, nič nepodpisuje).
3. https://app.safe.global → tvoj Safe → **Apps → Transaction Builder** → pretiahni `safe-batch.json` →
   skontroluj: 1× `enableModule(modul)` na Safe, potom `setToken`/`setPool` na module → **podpíš a vykonaj**.
4. Do Safe vlož testnet USDC/WETH, ktoré má agent nakupovať/predávať (zostávajú v Safe, agent ich nikdy nedrží).

### B4. Konfigurácia agentov
`agents.json` (nie je tajný, ale nedáva sa do gitu):
```json
[
  {
    "id": "btcdca",
    "name": "BTC DCA týždenne",
    "enabled": true,
    "strategy": "dca-brake-boost",
    "indicatorSymbol": "BTCUSDT",
    "module": "0xADRESA_MODULU",
    "tokenIn": "0xUSDC",
    "tokenOut": "0xWBTC_alebo_WETH",
    "fee": 500,
    "amountUsd": 25,
    "maxDailyUsd": 50,
    "intervalMinutes": 10080,
    "maxSlippageBps": 50
  }
]
```
`strategy`: `dca` (fixná suma) alebo `dca-brake-boost` (rovnaká logika RSI brzda/boost ako v appke).
Kľúč agenta `btcdca` sa hľadá v `AGENT_BTCDCA_PRIVATE_KEY` alebo v súbore `AGENT_BTCDCA_PRIVATE_KEY_FILE`.
Bez kľúča agent len stojí (status ukáže „missing key“) – nič sa nepokazí.

### B5. Kam dať kľúč na Fluxe (dôležité!)
**Bežné `environmentParameters` na Fluxe sú VEREJNÉ** (sú v blockchain spec appky). Preto kľúč nikdy nedávaj do JSON spec ako text.
Dve možnosti:
- **A (odporúčané) – súbor na volume:** spec už obsahuje `AGENTS_FILE=/appdata/agents.json` a
  `AGENT_BTCDCA_PRIVATE_KEY_FILE=/appdata/keys/btcdca.key`. Po nasadení v Flux cloud → My Apps → appka →
  komponent `runner` → **Volume / File browser** nahraj `agents.json` a `keys/btcdca.key` (jeden riadok `0x…`), potom **Restart** komponentu.
  Pri viacerých inštanciách to treba urobiť na každej → preto je v spec `"instances": 1`.
- **B – Enterprise (šifrovaná) appka:** pri registrácii zapni *Enterprise / Private* – spec aj env sú šifrované a vidí ich len
  vybraný (enterprise) node. Potom môžeš použiť priamo `AGENT_BTCDCA_PRIVATE_KEY=0x…` v env runnera. Stojí viac.

Úprimne: prevádzkovateľ Flux nodu, na ktorom runner beží, by sa teoreticky ku kľúču dostal. Preto je kľúč obmedzený modulom –
najhoršie, čo s ním niekto môže, je urobiť povolený swap v rámci limitov (výsledok ide aj tak do tvojho Safe) alebo modul pozastaviť.
Peniaze vybrať nemôže. Ak máš podozrenie: v Safe `setAgent(0x000…)` alebo `disableModule` a vytvor nový kľúč.

### B6. Spusti: najprv DRY-RUN, potom naostro
1. V spec doplň `owner`, `SAFE_ADDRESS`, prípadne `RPC_URL` (vlastný RPC od Alchemy/Infura je spoľahlivejší). Zaregistruj appku (krok 3 vyššie).
2. Nahraj `agents.json` + kľúč (B5) a reštartuj `runner`.
3. Otvor appku → **Agent** stránka → karta **„Serverový agent runner (Flux)“** alebo `https://<app>/agent-api/status`:
   - `preflight.ok: true` = modul patrí tvojmu Safe, je zapnutý, kľúč sedí, tokeny/pool povolené, agent nie je owner.
   - v `trades` uvidíš `dry-run` záznamy (koľko by kúpil, `minOut`, simulovaný výstup).
4. Keď je všetko OK niekoľko dní: vo Flux **Update App** → runner env `DRY_RUN=false`. Odteraz obchoduje sám (na testnete).
5. Mainnet až po audite modulu: nový modul na mainnete (deploy skript vyžaduje `ALLOW_MAINNET=true`), v runneri `NETWORK=arbitrum` + `ALLOW_MAINNET=true`, malé limity.

### B7. Zastavenie (kill switch)
- **Okamžite bez redeploy:** vytvor súbor `/appdata/KILL` vo volume runnera (file browser) → runner prestane obchodovať pri ďalšom ticku.
- **Env:** `KILL_SWITCH=true` (Update App). S `KILL_SWITCH_PAUSE_ONCHAIN=true` zavolá aj `pause()` na module.
- **On-chain (najistejšie):** v Safe `pause()` / `setAgent(0x0)` / `disableModule` na module – platí aj keby runner niekto ovládol.

### B8. Lokálny test oboch komponentov
```bash
mkdir -p runner-data/keys && cp agent-runner/scripts/agents.example.json runner-data/agents.json   # uprav
echo 0xTESTNET_AGENT_KEY > runner-data/keys/btcdca.key     # runner-data/ je v .gitignore
SAFE_ADDRESS=0x... docker compose up -d --build
curl http://localhost:8080/agent-api/status
npm run test:runner      # testy runnera s mockovaným chainom
forge test               # testy modulu + deploy skriptu
```

### Runner env premenné
| Premenná | Predvolené | Popis |
|---|---|---|
| `NETWORK` | `arbitrum-sepolia` | `sepolia`, `base-sepolia`; mainnety `arbitrum`, `ethereum`, `base` len s `ALLOW_MAINNET=true` |
| `ALLOW_MAINNET` | `false` | explicitný súhlas s reálnymi peniazmi |
| `RPC_URL` | verejný RPC siete | odporúčaný vlastný |
| `SAFE_ADDRESS` | – | tvoj Safe |
| `EXPECTED_ROUTER` | – | voliteľne: runner overí, že modul používa tento router |
| `AGENTS` / `AGENTS_FILE` | – | JSON zoznam agentov (B4) |
| `AGENT_<ID>_PRIVATE_KEY(_FILE)` | – | kľúč agenta (B5) |
| `DRY_RUN` | `true` | len simulácia |
| `KILL_SWITCH`, `KILL_SWITCH_PAUSE_ONCHAIN` | `false` | zastavenie |
| `STATE_DIR` | `/appdata` | stav + história obchodov (`agent-runner-state.json`) |
| `STATUS_PORT`, `STATUS_TOKEN` | `8090`, – | voliteľný Bearer token pre `/status` |
| `TICK_SECONDS` | `60` | min. 15 |

Viac inštancií runnera naraz nespôsobí dvojité nákupy nad limit – cooldown a denný limit sú v kontrakte (druhý pokus sa revertne).

## Riešenie problémov
- **„Image not found / pull error“** → image nie je Public alebo tag neexistuje (case-sensitive, všetko malými písmenami).
- **„architecture not supported“** → chýba `linux/amd64` → build s `--platform linux/amd64`.
- **„Unsupported parameter … in component“** → v komponente je pole, ktoré v8 nepozná (`tiered`, `secrets`, …).
- **Appka sa nezobrazí v Safe{Wallet}** → skontroluj `curl -I https://<app>/manifest.json` (musí mať `Access-Control-Allow-Origin: *`) a HTTPS.
- **Runner: `preflight` hlási problém** → prečítaj text: „module is NOT enabled“ = krok B3; „module.agent != key address“ = zlý kľúč; „agent key is a Safe OWNER“ = použi iný kľúč.
- **`/agent-api/status` vracia 502** → runner ešte nebeží alebo `AGENT_STATUS_UPSTREAM` nezodpovedá `http://fluxrunner_<name>:8090` (meno appky z `name`).
- Logy: Flux cloud → My Apps → appka → Management → Logs.
