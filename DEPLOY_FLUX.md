# Nasadenie na Flux (runonflux.io)

Aplikácia je **statická webová aplikácia** (Vite + React). Na Flux beží ako jeden malý
kontajner `nginx` (≈50 MB), ktorý servíruje build na porte **8080**. Žiadne kľúče, žiadna databáza
v kontajneri – Supabase / RPC / Safe sú externé služby.

## Prečo to doteraz nešlo (príčiny)

| # | Problém | Oprava |
|---|---------|--------|
| 1 | **Image nikdy nebol publikovaný.** `ghcr.io/simro0987/buy-simple-dca:latest` neexistuje / nie je verejný (anonymný pull vracia 403), na Docker Hube `simro0987` nemá žiadny repozitár. Flux nody si image musia vedieť stiahnuť **verejne**. | `deploy/github-actions/docker-publish.yml` (presuň do `.github/workflows/`) buildí a pushuje image. Balík na GHCR treba **raz prepnúť na Public** (GHCR je defaultne private). |
| 2 | **Architektúra.** Image zbuildovaný na Macu s Apple Silicon je `arm64`; Flux nody sú `amd64` → „architecture not supported“. | Workflow a `docker-compose.yml` buildia `linux/amd64`. Ručne: `docker buildx build --platform linux/amd64 ...` |
| 3 | **Neplatná Flux špecifikácia.** Flux v8 povoľuje v komponente len `name, description, repotag, ports, containerPorts, environmentParameters, commands, containerData, domains, repoauth, cpu, ram, hdd` – napr. `tiered`/`secrets` → „Unsupported parameter“. Názov komponentu len `a-z A-Z 0-9`. Verejný port `8080` alebo `<1024` je „enterprise“ port (spoplatnený navyše). | `deploy/flux/flux-app-spec.json` – overené voči zdrojákom FluxOS (`appValidator.js`). Verejný port `37080` → kontajner `8080`. |
| 4 | **Env premenné nefungovali.** `VITE_*` sa do Vite appky „zapečú“ pri builde – `environmentParameters` vo Fluxe za behu nemali žiadny efekt. | Kontajner pri štarte vygeneruje `/env-config.js` (`window.__APP_CONFIG__`) z povoleného zoznamu verejných premenných; appka ich číta cez `src/lib/runtimeConfig.ts`. |
| 5 | **Safe App nefungovala mimo Vercelu.** Safe{Wallet} načíta `manifest.json` cross-origin a appku vkladá do iframe – na Verceli to riešil `vercel.json`, v Docker image (`serve`) tieto hlavičky chýbali. | `deploy/nginx/default.conf`: CORS na `/manifest.json`, `frame-ancestors` pre `app.safe.global`, SPA fallback, `/healthz`. |
| 6 | Kontajner bežal ako `node` s `/data` – Flux mountuje `containerData` ako root → zápis by zlyhal. Appka nič nezapisuje, takže to nie je potrebné. | nginx-unprivileged (uid 101), zapisuje len do `/tmp`; `containerData` je len formálne `/appdata`. |
| 7 | Prázdne `VITE_SUPABASE_URL` → `createClient()` vyhodil chybu → čierna obrazovka. | Bezpečný fallback v `src/integrations/supabase/client.ts`. |

## Krok za krokom

### 1. Publikuj image (raz, potom automaticky)
0. **Najprv aktivuj workflow:** skopíruj `deploy/github-actions/docker-publish.yml` do `.github/workflows/docker-publish.yml`
   (na GitHube: *Add file → Create new file*, vlož obsah, commit). Automatizácia ho nemohla pushnúť – token nemá `workflow` scope.
1. Mergni PR do `main` → GitHub Actions spustí **docker-publish** a pushne
   `ghcr.io/simro0987/buy-simple-dca:latest` a `:sha-xxxxxxx` (pri tagu `v1.2.3` aj `:v1.2.3`).
2. Otvor `https://github.com/users/Simro0987/packages/container/buy-simple-dca/settings`
   → **Change visibility → Public**.
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

## Premenné prostredia (všetky sú VEREJNÉ – nikdy sem nedávaj tajomstvá)

| Premenná | Popis |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Prepíše hodnoty z buildu (`.env`). Publishable/anon kľúč je verejný. |
| `VITE_WALLETCONNECT_PROJECT_ID` | Zapne pripojenie Safe cez WalletConnect. |
| `VITE_SYSTEM_EXECUTION_MODE` | `PAPER` (predvolené). |
| `VITE_DEFAULT_SAFE_CHAIN` | rezervované. |

Zoznam je v `deploy/nginx/40-runtime-config.sh`; iné premenné sa do prehliadača **nedostanú**.

## Riešenie problémov
- **„Image not found / pull error“** → image nie je Public alebo tag neexistuje (case-sensitive, všetko malými písmenami).
- **„architecture not supported“** → chýba `linux/amd64` → build s `--platform linux/amd64`.
- **„Unsupported parameter … in component“** → v komponente je pole, ktoré v8 nepozná (`tiered`, `secrets`, …).
- **Appka sa nezobrazí v Safe{Wallet}** → skontroluj `curl -I https://<app>/manifest.json` (musí mať `Access-Control-Allow-Origin: *`) a HTTPS.
- Logy: Flux cloud → My Apps → appka → Management → Logs.
