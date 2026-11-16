# SafeBTC Agent · Inštitucionálny Decentralizovaný DeFi Operating System

Tento repozitár spája **Crypto DCA & Portfolio Tracker**, **Zisk Bot (PAPER Optimizer, Delta-Neutral Funding, Solana Lending, Learn-Sync)**, **ETT SuperTrend + Fibo + EMA/MA DEX stratégiu**, **Safe Global (`app.safe.global`) Multisig + on-chain swap-only agent modul (`contracts/AgentSwapModule.sol`)** a **15-agentovú kolektívnu architektúru s právom veta** do jedného produkčne pripraveného self-custody terminálu.

> **Upozornenie o riziku:** Tento systém nesľubuje ani negarantuje žiadny finančný výnos ani „úplnú ochranu pred stratou“. Každý on-chain swap, staking, lending alebo perp hedge nesie trhové riziko, smart-contract riziko, riziko depegu, sklzu (slippage) a výpadku orákul. Predvolený režim systému je striktne **PAPER / SHADOW** (`TREASURY_LIVE=0`).

---

## 1. Architektúra a 3 Vrstvy Oprávnení

1. **Immutable Security Layer (Nemenná on-chain bezpečnostná vrstva)**
   - Aplikácia nemá **žiadne privátne kľúče** a sama nič nepodpisuje. Každú transakciu podpisujú vlastníci Safe v `app.safe.global`.
   - Ak má AI agent obchodovať sám, dostane vlastný kľúč, ktorý smie on-chain **iba** volať `contracts/AgentSwapModule.sol`:
     - jediná akcia = swap cez Uniswap V3 s príjemcom natvrdo = tento Safe (žiadne prevody von, žiadny `transfer`, žiadny native send, žiadny DELEGATECALL),
     - len povolené tokeny a pooly, cenová ochrana cez Chainlink (max. sklz ≤ 5 %), limity na obchod/deň, cooldown,
     - agent nemôže meniť vlastníkov, threshold, guard, moduly ani limity; vlastníci modul kedykoľvek vypnú (`disableModule`).
   - Detaily, hrozby a nastavenie: **[SAFE_AGENT_PERMISSIONS.md](SAFE_AGENT_PERMISSIONS.md)**. (Pôvodný `SafeBTCGuard.sol` bol odstránený – po inštalácii by natrvalo zablokoval aj vlastníkov.)

2. **Decision, Oversight & Learning Layer (15 Špecializovaných AI Agentov s právom veta)**
   - Povinný rozhodovací reťazec:
     `Data Quality Agent (VETO) → Market Research Agent → Strategy Agent → Risk & Security Agent (NAJVYŠŠIE VETO) → Simulation Agent (VETO) → Execution Agent (Jediná fronta) → Safe Guard → 2-z-2 Multisig schválenie`.
   - Dohľad a samo-zlepšovanie (`Self-Improving Core` & `Agent Lifecycle Governance`):
     - `Agent Watchdog`, `Performance Evaluator`, `Incident Investigator`, `Repair Engineer` (len v sandboxe), `QA & Security Reviewer` (nezávislé schválenie), `Agent Architect` a `Agent Retirement Committee`.
     - Nová stratégia postupuje výhradne cez: `BACKTEST → WALK-FORWARD → SHADOW → PAPER → TESTNET → LIMITED_LIVE (Champion/Challenger)`.

3. **Execution Layer (Jediná Execution Queue & Nonce Manager)**
   - Na jednu Safe peňaženku existuje práve **jedna Execution Queue**, ktorá bráni duplicite obchodov a nonce konfliktom.
   - Ak nie je pripojená reálna Safe peňaženka, získané BTC aj počet live obchodov zobrazujú čestných **`0.000000 BTC`** (žiadne falošné live zisky).

---

## 2. Spustenie (Lokálne, Docker/Podman, Flux, Akash Network)

```bash
# 1. Lokálny vývoj a testy
npm install
npm run test
npm run dev       # http://localhost:8080/

# 2. Produkčný build
npm run build

# 3. Docker / Podman (PAPER režim natvrdo zapnutý)
docker compose up -d --build

# 4. Záloha a kontrola integrity stavových súborov + výpočet Merkle Root
node scripts/backup-restore-state.mjs backup
```

Nasadenie na **Flux (runonflux.io)**: pozri **[DEPLOY_FLUX.md](DEPLOY_FLUX.md)** a `deploy/flux/flux-app-spec.json`.
Pripojenie Safe{Wallet}: **[docs/SAFE_CONNECT.md](docs/SAFE_CONNECT.md)**.
Pre nasadenie na decentralizovanú sieť **Akash Network** použite manifest `deploy/akash-sdl.yaml`.


## Agent runner (autonómne obchodovanie na Flux)

`agent-runner/` je druhý Flux komponent: agenti obchodujú sami, ale **iba** cez `AgentSwapModule` (výsledok vždy späť do Safe). Testnet + DRY_RUN predvolene. Návod: `DEPLOY_FLUX.md` → Časť B.
