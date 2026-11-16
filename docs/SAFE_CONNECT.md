# Ako pripojiť Safe{Wallet}

Appka **nikdy** nedostane tvoj privátny kľúč ani seed. Osobnú peňaženku (MetaMask, Rabby,
Ledger, Trezor…) pripájaš **len na app.safe.global**. Appka vidí iba adresu tvojho Safe.

V Nastaveniach / na prihlasovacej stránke sú 3 tlačidlá:

### 1. „Otvoriť v Safe{Wallet}“ (odporúčané, najjednoduchšie)
1. Klikni → otvorí sa `app.safe.global` s našou appkou ako *Safe App*.
2. Prihlás sa do Safe svojou peňaženkou a vyber Safe.
3. Appka sa vo vnútri Safe pripojí **sama** (Safe Apps SDK) – nič nekopíruješ.

Prvýkrát sa Safe môže opýtať, či appke dôveruješ (custom app) – potvrď.
Funguje len cez **HTTPS** (Flux `https://<name>.app.runonflux.io`, Vercel, vlastná doména).

### 2. „WalletConnect“
Vyžaduje `VITE_WALLETCONNECT_PROJECT_ID` (zadarmo na https://cloud.reown.com). Bez neho je tlačidlo sivé.
1. Klikni → zobrazí sa QR kód a `wc:` kód.
2. Na `app.safe.global` otvor svoj Safe → hore klikni na ikonu **WalletConnect** → vlož kód (alebo naskenuj QR v Safe mobilnej appke).
3. Po schválení sa appka pripojí k Safe adrese (overí sa on-chain, že je to naozaj Safe).

> Pôvodná verzia generovala náhodný `wc:` reťazec lokálne – na tento kód nikto nepočúval,
> preto párovanie **nikdy nemohlo fungovať**. Teraz sa používa skutočný WalletConnect v2 klient.

### 3. „Iba sledovať adresu“
Vlož adresu Safe (napr. `arb1:0x…`). Appka ju overí on-chain (`getOwners`, `getThreshold`) a
zobrazí portfólio. Len na čítanie.

### Čo appka zobrazí po pripojení
- sieť, adresu, počet podpisov (napr. 2/3), vlastníkov, verziu Safe,
- **on-chain guard a moduly** prečítané priamo z kontraktu. Ak tam nie je žiadny modul,
  agenti **nemôžu** nič vykonať sami – iba navrhujú; každý obchod podpisuješ ty v Safe.
- Pozor: modul môže vykonávať transakcie bez podpisu vlastníkov – maj zapnuté len moduly, ktoré poznáš
  (napr. `AgentSwapModule`, pozri `SAFE_AGENT_PERMISSIONS.md`).

### Opravené chyby
- Falošný WalletConnect URI (nikdy nefungoval) → skutočný WalletConnect v2.
- Overenie Safe bolo **fail-open**: pri chybe RPC appka prijala akúkoľvek adresu ako „overený Safe“ → teraz fail-closed.
- Akýkoľvek kontrakt, ktorý vrátil 32 bajtov na `getThreshold()`, sa bral ako Safe → teraz sa kontroluje aj `getOwners()` a `threshold ≤ owners`.
- UI tvrdilo „Zodiac Guard LOCKED“ bez akejkoľvek kontroly → teraz sa zobrazuje skutočný guard / moduly z blockchainu.
- Siete BTC / SOL / HYPE nie sú Safe{Wallet} siete → už sa v Safe výbere neponúkajú.
