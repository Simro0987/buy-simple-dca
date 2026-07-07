# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Single-product Vite + React + TypeScript PWA ("Crypto DCA & Portfolio Tracker", a.k.a. "Edge Trader Terminal"). There is no local backend server: the app talks to a **hosted/remote Supabase project** whose URL/keys are committed in `.env` (`VITE_*`). No local database, Docker, or Supabase CLI is required to run the app. The `supabase/` folder (migrations + edge functions) is only for backend development against the hosted project and is optional for local dev.

### Package manager
Use **npm** (the update script runs `npm install`). Both `bun.lock` and `package-lock.json` are committed, but `bun` is not installed in this environment; npm + Node 22 works.

### Commands (see `package.json` scripts)
- Dev server: `npm run dev` — Vite on port **8080** (`http://localhost:8080/`).
- Build: `npm run build`; preview built assets: `npm run preview`.
- Tests: `npm run test` (Vitest, jsdom) — all unit tests pass.
- Lint: `npm run lint` (ESLint flat config). NOTE: the repo currently has **pre-existing lint errors** (`no-explicit-any`, `react-hooks/exhaustive-deps`, etc.) in existing source and `supabase/functions`; `eslint .` runs fine but does not exit clean. Do not treat these as regressions from setup.

### PIN lock gotcha (important for testing the UI)
The app is gated behind a 4-digit **PIN lock screen** (`src/components/PinLock.tsx`, `src/lib/pin.ts`). Unlock state is stored in `sessionStorage` under the key **`bsdca-unlocked`** (value `'1'`).
- If the remote Supabase `app_settings` row already has a `pin_hash`, you will be prompted to "Enter PIN" and cannot guess it.
- To bypass for local testing, set `sessionStorage.setItem('bsdca-unlocked','1')` in the browser console (or via the automation tool) and reload the page.
- If no `pin_hash` exists remotely, the first launch instead lets you create a new PIN (enter it twice).

### External data / "API Disconnected"
The dashboard calls public market APIs (CoinGecko, alternative.me, DeFiLlama, etc.) directly from the browser. When these are rate-limited/unreachable, the UI shows an "API Disconnected – showing static data" banner and renders cached/static values. This is graceful degradation, not a setup failure.
