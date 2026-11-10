# SafeBTC Agent · Inštitucionálny Decentralizovaný DeFi Operating System

Tento repozitár spája **Crypto DCA & Portfolio Tracker**, **Zisk Bot (PAPER Optimizer, Delta-Neutral Funding, Solana Lending, Learn-Sync)**, **ETT SuperTrend + Fibo + EMA/MA DEX stratégiu**, **Safe Global (`app.safe.global`) 2-z-2 Multisig + On-Chain Safe Guard (`contracts/SafeBTCGuard.sol`)** a **15-agentovú kolektívnu architektúru s právom veta** do jedného produkčne pripraveného self-custody terminálu.

> **Upozornenie o riziku:** Tento systém nesľubuje ani negarantuje žiadny finančný výnos ani „úplnú ochranu pred stratou“. Každý on-chain swap, staking, lending alebo perp hedge nesie trhové riziko, smart-contract riziko, riziko depegu, sklzu (slippage) a výpadku orákul. Predvolený režim systému je striktne **PAPER / SHADOW** (`TREASURY_LIVE=0`).

---

## 1. Architektúra a 3 Vrstvy Oprávnení

1. **Immutable Security Layer (Nemenná on-chain bezpečnostná vrstva)**
   - Smart kontrakt `contracts/SafeBTCGuard.sol` + 4 oddelené Safe trezory:
     - **Cold Treasury Safe**: Hlavné dlhodobé BTC rezervy — AI agenti k nemu nemajú žiadny prístup (`0%` obchodovanie).
     - **Strategy Safe**: Vymedzená časť kapitálu pre povolené DEX swapy v rámci prísneho risk budgetu.
     - **Gas Safe**: Oddelený malý rozpočet na gas a Akash prevádzku.
     - **Profit Vault**: Zisk sa periodicky uzamyká sem; agent z neho nikdy nevie poslať kapitál späť.
   - **Tvrdé zákazy v `SafeBTCGuard.sol`**:
     - Zákaz natívnych a ERC-20 transferov na akékoľvek externé adresy (`ExternalTransferForbidden`).
     - Zákaz `DelegateCall` (`DelegateCallForbidden`).
     - Zákaz `Unlimited Approvals` (`approve(..., uint256.max)` je zablokované; povolené len presné limity pre schválené DEX routre).
     - Zákaz zmeny vlastníkov Safe (`addOwner`, `removeOwner`, `swapOwner`), `changeThreshold`, `setGuard`, `enableModule` a `setFallbackHandler` cez agenta.
     - Globálny **KILL SWITCH** a **PAUSE** pri anomálii.

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

## 2. Spustenie (Lokálne, Docker/Podman, Akash Network)

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

Pre nasadenie na decentralizovanú sieť **Akash Network** použite manifest `deploy/akash-sdl.yaml`.
