# Nasadenie na Flux – čo musíš urobiť ty

Appka = 1 Flux appka so 4 komponentmi (`db`, `api`, `web`, `runner`), špecifikácia `deploy/flux/flux-app-spec.json`.
Doména: predvolená Flux doména `https://buysimpledca.app.runonflux.io` (bez vlastnej domény), 1 inštancia, plán Standard.
Podrobný technický popis (zdroje, zálohy, obnova, runner): `docs/archive/DEPLOY_FLUX_detail.md` a `api/README.md`.

## Checklist

1. **Merge PR do `main`** → GitHub Actions zbuildí a pushne 4 image (`:latest` aj `:sha-xxxxxxx`, linux/amd64).
2. **GHCR balíky prepni na Public** (raz): github.com → Your profile → Packages →
   `buy-simple-dca`, `buy-simple-dca-api`, `buy-simple-dca-db`, `buy-simple-dca-agent-runner` → Package settings → Change visibility → Public.
3. **Pripni verzie (odporúčané):** v `flux-app-spec.json` nahraď `:latest` tagom `:sha-xxxxxxx` z behu Actions (rovnaký pre všetky 4).
4. **ZelID:** v `flux-app-spec.json` nahraď `"owner": "REPLACE_WITH_YOUR_ZELID"` svojím ZelID (Zelcore / SSP Wallet).
5. **Storj (zálohy):** vytvor bucket + S3 kľúče (Access Key, Secret Key) na storj.io. Po prvom spustení zapíš do priečinka komponentu `db`
   súbor `backup.env` (vzor `db/backup.env.example`): `S3_BUCKET=…`, `S3_ACCESS_KEY_ID=…`, `S3_SECRET_ACCESS_KEY=…`.
   Šifrovací kľúč (`BACKUP_AGE_RECIPIENTS`) je už v špecifikácii; súkromný age kľúč si drž offline.
6. **Zaregistruj a zaplať appku:** cloud.runonflux.io → Register new app → vlož obsah `flux-app-spec.json` → podpíš ZelID → zaplať.
7. **Safe adresa pre runner:** `SAFE_ADDRESS=0xREPLACE_WITH_YOUR_SAFE` → tvoja Safe (testnet; `DRY_RUN=true` nechaj).
8. **Vercel:** GitHub → Settings → Applications → Vercel → Uninstall (a zmaž Vercel projekt).
9. **Starý Supabase:** v git histórii je verejný anon kľúč projektu `ctykeosgiekmdhgdcvgc` → v Supabase ho **rotuj alebo projekt zmaž**
   (najprv prípadne jednorazový export dát: `api/scripts/export-from-supabase.sh`).
10. **Voliteľné kľúče** (súbor `/appdata/secrets.env` komponentu `api`, vzor `api/secrets.env.example`):
    `AI_API_KEY` (+ `AI_BASE_URL`, `AI_MODEL`) pre AI chat, `TELEGRAM_BOT_TOKEN` pre notifikácie,
    `SOLANA_RPC_URL` (napr. Helius), `COINGLASS_API_KEY`, `CRYPTOPANIC_API_KEY`, `ETHERSCAN_API_KEY`.
    Voliteľne `VITE_WALLETCONNECT_PROJECT_ID` (cloud.reown.com) v komponente `web`.

Kontrola po nasadení: `https://buysimpledca.app.runonflux.io/healthz` a `…/api/healthz` vracajú OK, prihlásenie peňaženkou funguje.
