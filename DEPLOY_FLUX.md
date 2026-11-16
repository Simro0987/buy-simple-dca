# Nasadenie na Flux (runonflux.io)

Celá aplikácia beží na Fluxe ako **jedna appka so 4 komponentmi** (`deploy/flux/flux-app-spec.json`):

| # | Komponent | Image | Verejný port | Úloha |
|---|---|---|---|---|
| 0 | `db` | `ghcr.io/simro0987/buy-simple-dca-db` | – | vlastný Postgres 16 + nočná šifrovaná záloha na Storj (Časť C) |
| 1 | `api` | `ghcr.io/simro0987/buy-simple-dca-api` | – | náhrada Supabase: prihlásenie peňaženkou (SIWE), dáta (PostgREST + RLS), 32 edge funkcií, cron |
| 2 | `web` | `ghcr.io/simro0987/buy-simple-dca` | 37080 → 8080 | nginx so statickou appkou, proxy `/sb/` → api a `/agent-api/status` → runner |
| 3 | `runner` | `ghcr.io/simro0987/buy-simple-dca-agent-runner` | – | AI agenti, len swap cez `AgentSwapModule` (Časť B) |

Supabase už **nie je potrebný** (dáta sa dajú jednorazovo preniesť, Časť C6). Poradie komponentov je dôležité
(`api` čerpá heslo databázy z priečinka komponentu `db`, Flux dovolí odkaz len na komponent s nižším indexom).

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

Databáza je **vlastný Postgres ako komponent tej istej appky** (nie platený databázový doplnok Fluxu).
Dáta sú v trvalom priečinku komponentu (`hdd`), ktorý je v cene.

| Komponent | CPU | RAM | SSD | Reálna spotreba (meraná lokálne) |
|---|---|---|---|---|
| `db` (Postgres 16, `shared_buffers=96MB`, max. 30 spojení) | 0.3 | 500 MB | 5 GB | ~40 MB RAM v pokoji |
| `api` (Node + PostgREST) | 0.3 | 300 MB | 1 GB | ~40–120 MB RAM (heap max. 160 MB) |
| `web` (nginx, statické súbory) | 0.1 | 100 MB | 1 GB | ~7 MB RAM, ~0 % CPU |
| `runner` (Node, 1 tick/min) | 0.2 | 200 MB | 1 GB | ~25–80 MB RAM (heap obmedzený na 128 MB) |
| **Spolu** | **0.9** | **1100 MB** | **8 GB** | 1 inštancia (`"instances": 1`) |

Zmestí sa do plánu **Standard (1.5 vCPU / 4 GB / 15 GB, ~2.49 $/mesiac)**; podľa cenníka za zdroje
(0.03 FLUX / 0.1 CPU, 0.01 FLUX / 100 MB RAM, 0.004 FLUX / GB) vychádza ~0.41 FLUX/mesiac, teda Flux účtuje svoje minimum ~0.99 $.
0.1 CPU / 100 MB / 1 GB je **minimum**, ktoré Flux povolí (`appValidator.js`).
**`instances` musí zostať 1** – databáza je jedna (primárna), viac kópií by malo každá svoje vlastné dáta.
Stav runnera (`/appdata/agent-runner-state.json`, max. 200 posledných obchodov) má pár desiatok kB.

## Krok za krokom

### 1. Publikuj image (raz, potom automaticky)
0. **Workflow je už aktívny** v `.github/workflows/docker-publish.yml` (spustí sa po merge do `main`).
1. Mergni PR do `main` → GitHub Actions spustí **docker-publish** a pushne štyri image:
   `ghcr.io/simro0987/buy-simple-dca` (web), `…-agent-runner`, `…-api`, `…-db` – každý ako `:latest`
   aj `:sha-xxxxxxx` (pri git tagu `v1.2.3` aj `:v1.2.3`).
2. Otvor `https://github.com/users/Simro0987/packages/container/<balík>/settings` pre
   `buy-simple-dca`, `buy-simple-dca-agent-runner`, `buy-simple-dca-api` a `buy-simple-dca-db`
   → **Change visibility → Public** (pri všetkých; Flux nevie stiahnuť súkromný image).
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
| `API_UPSTREAM` | (nie pre prehliadač) adresa api komponentu, napr. `http://fluxapi_buysimpledca:8070` → appka ho volá cez `/sb/`. |
| `VITE_AUTH_MODE` | `siwe` = prihlásenie peňaženkou (vlastné API). Bez neho ostáva pôvodný e-mail/heslo (Supabase). |

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

## Časť C: Vlastná databáza a API namiesto Supabase (komponenty `db` + `api`)

### C1. Ako to funguje
- `db` = Postgres 16 bez verejného portu. Pri prvom štarte vygeneruje náhodné heslo do priečinka
  `secrets` (Flux mount `m:secrets`), ktorý vidí **len** komponent `api` (`c:0:secrets`). Heslo nikde nepíšeš.
- `api` = jeden Node kontajner, ktorý pre appku vyzerá ako Supabase (`supabase-js` v appke ostal):
  - `/auth/v1` – **Sign-In with Ethereum**: podpíšeš jednu správu peňaženkou alebo **Safe** (EIP-1271, podpíšu vlastníci
    podľa thresholdu). Nič sa neodosiela, žiadny gas. Používateľ = adresa peňaženky/Safe. E-mail/heslo už nie je.
  - `/rest/v1` – PostgREST; každý vidí **len svoje riadky** (Row Level Security priamo v Postgrese, ako predtým).
  - `/functions/v1` – všetkých 32 pôvodných edge funkcií, bez zmeny kódu.
  - cron (namiesto `pg_cron`): `telegram-poll-callbacks` každú minútu, `telegram-daily-risk-report` o 18:00 UTC.
- `web` posiela všetko cez `/sb/` na `api` (rovnaká doména → žiadne CORS, nič ďalšie verejné).
- Tajomstvá (Telegram, AI kľúč…) sú **len v kontajneri `api`** v súbore `/appdata/secrets.env` – nie v spec (tá je verejná).

### C2. Pred registráciou uprav v `deploy/flux/flux-app-spec.json`
| Kde | Čo |
|---|---|
| `owner` | tvoje ZelID |
| `api` → `SIWE_DOMAINS` | doména appky bez `https://`, napr. `buysimpledca.app.runonflux.io` (viac domén oddeľ čiarkou) |
| `db` → `BACKUP_AGE_RECIPIENTS` | tvoj **verejný** age kľúč `age1…` (C4) |
| `name` | ak zmeníš meno appky, zmeň aj `DB_HOST=fluxdb_<meno>`, `API_UPSTREAM=http://fluxapi_<meno>:8070`, `AGENT_STATUS_UPSTREAM` |

Ak už appka beží s 2 komponentmi: **Update App** a vlož celú novú spec (4 komponenty v tomto poradí).

### C3. Tajomstvá pre `api` (voliteľné – bez nich dané funkcie len nefungujú)
Vzor: `api/secrets.env.example`. Vyplň a nahraj cez Flux → My Apps → appka → komponent `api` → **Volume / File browser**
ako `/appdata/secrets.env`, potom **Restart** komponentu `api`.
- `TELEGRAM_BOT_TOKEN` – od @BotFather (Telegram upozornenia a tlačidlá).
- `AI_BASE_URL` + `AI_API_KEY` (+ voliteľne `AI_MODEL`) – ľubovoľné OpenAI-kompatibilné API (OpenRouter, OpenAI, Groq…).
  Nahrádza `LOVABLE_API_KEY`. OpenRouter rozumie pôvodným názvom modelov (`google/gemini-2.5-flash`).
- `CRYPTOPANIC_API_KEY`, `ETHERSCAN_API_KEY`, `MOBULA_API_KEY` – ako predtým v Supabase.

### C4. Nočná šifrovaná záloha na Storj
Záloha = `pg_dump` → gzip → **age** šifrovanie len **verejným** kľúčom → upload na Storj (S3). Server svoje zálohy
**nevie rozšifrovať** – súkromný kľúč máš len ty (offline). Plaintext sa nikdy nezapisuje na disk.
1. Kľúč (na svojom počítači): `age-keygen -o dca-backup.key` → vypíše `Public key: age1…`.
   Súbor `dca-backup.key` ulož bezpečne (napr. heslový manažér + papier). **Bez neho sa záloha nedá obnoviť.**
2. Storj: účet na https://storj.io → bucket napr. `buy-simple-dca-backups` → **Access Keys → S3 credentials**
   obmedzené na tento bucket s právami **Write + List + Delete** (Read netreba).
3. Vyplň `db/backup.env.example` (endpoint `https://gateway.storjshare.io`, bucket, access key, secret, `BACKUP_AGE_RECIPIENTS=age1…`)
   a nahraj ho cez File browser komponentu `db` ako `backup.env` do koreňa volume (`/var/lib/postgresql/data/backup.env`).
   Restart `db`. Súbor je potom čitateľný len pre postgres v kontajneri `db`.
4. Spúšťa sa každú noc o `BACKUP_HOUR_UTC` (2:00 UTC = 3:00 v zime v SK). Ponecháva `BACKUP_KEEP_DAYS=30` dní, minimálne
   `BACKUP_KEEP_MIN=7` posledných záloh. Záloha hneď: vytvor prázdny súbor `BACKUP_NOW` v koreni volume `db` (do minúty).
   Stav: `backup-status.json` (posledná OK) / `backup-status.failed.json` vo volume, a logy komponentu `db`.

**Cena Storj:** úložisko 7 $/TB (naša záloha má desiatky kB až pár MB → centy), ale Storj má **minimum 5 $/mesiac**,
ktoré odpadá len pri platbe cez **USDC** (Ethereum). Ak nechceš riešiť USDC, funguje to s ľubovoľným S3:
Cloudflare R2 (`S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`, 10 GB zadarmo) alebo Backblaze B2.

### C5. Obnova zo zálohy
Obnovuje sa do **prázdnej** databázy (nový/zmazaný volume `db`, `api` zastavené alebo ešte nespustené):
```bash
# na svojom počítači (Docker), so stiahnutou zálohou (Storj web UI alebo s3 klient):
docker run -d --name dbrestore -v dca-restore:/var/lib/postgresql/data ghcr.io/simro0987/buy-simple-dca-db:latest
docker cp db-20261116T020000Z.sql.gz.age dbrestore:/tmp/b.age
docker cp dca-backup.key dbrestore:/tmp/k.key && docker exec dbrestore chown postgres /tmp/k.key /tmp/b.age
docker exec -u postgres dbrestore restore.sh /tmp/b.age /tmp/k.key     # -> "restore: ok - tables: 18"
```
Na Fluxe (napr. po výmene nodu, keď je databáza prázdna): nahraj kľúč dočasne do volume `db` (File browser),
v termináli komponentu `db` (Flux → Console) spusti
`restore.sh s3://buy-simple-dca/db-<čas>.sql.gz.age /var/lib/postgresql/data/dca-backup.key --replace`
(`--replace` zmaže prázdne tabuľky, ktoré medzitým vytvorilo `api`; S3 prístup sa vezme z `backup.env`),
potom kľúč **hneď zmaž** a reštartuj `api` (migrácie zistí ako hotové, heslo pre PostgREST si nastaví samo).
Overené lokálne: záloha → šifrovanie → S3 → stiahnutie → rozšifrovanie → obnova → API + prihlásenie fungujú, dáta sedia.

### C6. Presun dát zo Supabase (jednorazovo, voliteľné)
1. Supabase → Project Settings → Database → **Connection string** (Session pooler, s heslom).
2. Na svojom počítači (potrebuješ `psql`/`pg_dump` ≥ verzia Supabase, alebo Docker `postgres:17-alpine`):
   ```bash
   SUPABASE_DB_URL='postgresql://postgres.<ref>:<heslo>@aws-0-<región>.pooler.supabase.com:5432/postgres' \
   WALLET_MAP='tvoj@email.sk=0xTvojSafeAleboPenazenka' \
   ./api/scripts/export-from-supabase.sh > supabase-import.sql
   ```
   Skript na Supabase len číta. `WALLET_MAP` priradí každému Supabase účtu (e-mail) adresu, ktorou sa odteraz prihlasuješ
   (ID používateľa zostane, takže všetky riadky ostanú tvoje). Ak niekto s dátami chýba, skript skončí s chybou.
3. Nahraj `supabase-import.sql` cez File browser komponentu `api` do `/appdata/import/` a reštartuj `api`.
   Import beží raz v jednej transakcii (prepíše dáta appky), súbor sa premenuje na `.done` (pri chybe `.failed` + log).
4. Prihlás sa peňaženkou z `WALLET_MAP` → uvidíš svoje dáta. Potom môžeš Supabase projekt vypnúť.

### C7. Vercel
Vercel build bez zmien ďalej používa Supabase (e-mail/heslo). Plná funkcionalita s vlastnou databázou je na Fluxe.
Ak chceš, aby aj Vercel používal Flux API: vo Verceli `VITE_SUPABASE_URL=https://<flux-app>/sb`,
`VITE_SUPABASE_PUBLISHABLE_KEY=public-anon`, `VITE_AUTH_MODE=siwe` a v `api` doplň
`API_ALLOWED_ORIGINS=https://<tvoja-vercel-doména>` a do `SIWE_DOMAINS` aj Vercel doménu.

### C8. Bezpečnosť – zhrnutie
- `db` a `api` nemajú verejný port; Postgres heslo je náhodné a nikdy nie je v spec ani v logoch.
- Prístupové tokeny sú podpísané kľúčom, ktorý vznikne v `api` volume (`/appdata/secrets`); refresh tokeny sa rotujú,
  opätovné použitie starého tokenu zruší celú reláciu.
- Chránené funkcie potrebujú prihláseného používateľa (prísnejšie ako Supabase, kde stačil verejný anon kľúč).
- Prihlásenie podpisom **nedáva appke žiadny prístup k prostriedkom**; Safe moduly/agent limity platia ako v Časti B.

## Riešenie problémov
- **„Image not found / pull error“** → image nie je Public alebo tag neexistuje (case-sensitive, všetko malými písmenami).
- **„architecture not supported“** → chýba `linux/amd64` → build s `--platform linux/amd64`.
- **„Unsupported parameter … in component“** → v komponente je pole, ktoré v8 nepozná (`tiered`, `secrets`, …).
- **Appka sa nezobrazí v Safe{Wallet}** → skontroluj `curl -I https://<app>/manifest.json` (musí mať `Access-Control-Allow-Origin: *`) a HTTPS.
- **Runner: `preflight` hlási problém** → prečítaj text: „module is NOT enabled“ = krok B3; „module.agent != key address“ = zlý kľúč; „agent key is a Safe OWNER“ = použi iný kľúč.
- **`/agent-api/status` vracia 502** → runner ešte nebeží alebo `AGENT_STATUS_UPSTREAM` nezodpovedá `http://fluxrunner_<name>:8090` (meno appky z `name`).
- **Prihlásenie peňaženkou: „SIWE domain … not allowed“** → doplň doménu appky do `SIWE_DOMAINS` komponentu `api`.
- **`/sb/healthz` vracia 502** → `api` ešte štartuje alebo `API_UPSTREAM` ≠ `http://fluxapi_<name>:8070`.
- **`api` log „waiting for database“** → `db` beží? `DB_HOST=fluxdb_<name>`? Je `c:0:secrets` v `containerData` api a `db` je komponent č. 0?
- **Záloha** → logy `db` (`backup: …`), `backup-status.failed.json`; „not configured“ = chýba `backup.env` alebo hodnota.
- Logy: Flux cloud → My Apps → appka → Management → Logs.
