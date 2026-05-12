## Zlúčenie Analýza + Riziko do jednej sekcie

### Cieľ
Vytvoriť jednu unified stránku "Analýza & Riziko", ktorá kombinuje všetky komponenty z oboch sekcií a zdieľa rovnaké dáta (ceny, ATH, cyklus).

### Zmeny

#### 1. Nová unified stránka: `src/pages/AnalysisRiskPage.tsx`
Kombinuje v poradí:
- **Risk & Cyklus** (RiskDashboard komponent)
- **Token analýza** (AnalysisPage komponent)
- **Pokročilá analýza trhu** (AdvancedMarketPage komponent)

Všetky komponenty zdieľajú rovnaké dáta: `prices`, `athData`, `cycleResult`, `lang`.

#### 2. Update `src/lib/tabRoutes.tsx`
- `analysis` tab → renderuje novú `AnalysisRiskPage` s `prices`, `athData`, `cycleResult`, `lang`
- `risk` tab → presmeruje/alias na rovnakú stránku alebo sa odstráni
- `market` tab → alias na rovnakú stránku

#### 3. Update `src/components/BottomNav.tsx`
- Odstráni sa samostatná záložka `risk`
- Záložka `analysis` zostane ako jediný vstup
- Zbytočný `market` tab sa vyčistí (už bol alias)

#### 4. Data flow
Pomocou `TabContext` už prúdia `prices`, `athData`, `cycleResult` do všetkých tabov. Nová stránka ich len príjme a rozdelí komponentom.

### Technické detaily
- `RiskDashboard` potrebuje: `lang`, `prices`, `athData`, `cycleResult`
- `AnalysisPage` potrebuje: `lang` (ceny si načíta cez hook)
- `AdvancedMarketPage` potrebuje: `lang` (dáta si načíta cez hook)
- Súčasná `AnalysisMarketPage.tsx` bude nahradená/nepoužitá

### Výsledok
Jedna záložka v navigácii → "Analýza" (alebo premenovať na "Analýza & Riziko"), ktorá zobrazuje kompletný pohľad: cyklový signál, riziká tokenov, technickú analýzu aj pokročilé trhové metriky.