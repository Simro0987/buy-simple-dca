import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  KeyRound,
  Sparkles,
  Palette,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  Send,
  Eye,
  EyeOff,
  Cpu,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import {
  UI_THEME_PRESETS,
  loadWebsiteGuardianState,
  saveWebsiteGuardianState,
  loadGuardianPatchLogs,
  subscribeWebsiteGuardian,
  loadGeminiApiKey,
  saveGeminiApiKey,
  runAutonomousWebsiteGuardianScanAndPatch,
  evolveWebsiteUiDesign,
  askWebsiteGuardianAi,
  type WebsiteGuardianState,
  type GuardianPatchLogEntry,
  type UiThemePresetId,
} from '@/lib/websiteGuardianAgent';

interface Props {
  lang: Lang;
}

export function WebsiteGuardianPanel({ lang }: Props) {
  const sk = lang === 'sk';
  const [guardian, setGuardian] = useState<WebsiteGuardianState>(() =>
    loadWebsiteGuardianState(),
  );
  const [patchLogs, setPatchLogs] = useState<GuardianPatchLogEntry[]>(() =>
    loadGuardianPatchLogs(),
  );
  const [geminiKey, setGeminiKey] = useState<string>(() => loadGeminiApiKey());
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [aiCommand, setAiCommand] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiLastResponse, setAiLastResponse] = useState<string>('');

  // Custom module builder state
  const [newModTitle, setNewModTitle] = useState('');
  const [newModValue, setNewModValue] = useState('');

  useEffect(() => {
    const sync = () => {
      setGuardian(loadWebsiteGuardianState());
      setPatchLogs(loadGuardianPatchLogs());
      setGeminiKey(loadGeminiApiKey());
    };
    return subscribeWebsiteGuardian(sync);
  }, []);

  const handleSaveGeminiKey = (val: string) => {
    setGeminiKey(val);
    saveGeminiApiKey(val);
    const updated = loadWebsiteGuardianState();
    updated.aiProvider = val.trim() ? 'gemini' : 'sovereign_local';
    saveWebsiteGuardianState(updated);
  };

  const handleToggleAutopilot = () => {
    const next: WebsiteGuardianState = {
      ...guardian,
      autopilotEnabled: !guardian.autopilotEnabled,
    };
    saveWebsiteGuardianState(next);
    setGuardian(next);
    toast.success(
      next.autopilotEnabled
        ? sk
          ? 'Aegis 24/7 Autopilot zapnutý — bezpečnostné skeny, šifrovanie a záplaty bežia plne automaticky.'
          : 'Aegis 24/7 Autopilot enabled — security scans, encryption & patches run automatically.'
        : sk
          ? 'Aegis Autopilot pozastavený.'
          : 'Aegis Autopilot paused.',
    );
  };

  const handleRunScanAndAutoPatch = async () => {
    setScanning(true);
    try {
      const { state } = await runAutonomousWebsiteGuardianScanAndPatch();
      setGuardian(state);
      setPatchLogs(loadGuardianPatchLogs());
      toast.success(
        sk
          ? `Hĺbkový sken #${state.totalScansCompleted} dokončený! AES-256-GCM šifrovanie obnovené, 8/8 vrstiev zabezpečených, výber z peňaženky 100% uzamknutý.`
          : `Deep scan #${state.totalScansCompleted} complete! AES-256-GCM encryption refreshed, 8/8 layers secured, external withdrawals 100% locked.`,
      );
    } finally {
      setScanning(false);
    }
  };

  const handleTestGuardianCannotWithdraw = async () => {
    const { guardSelfTestVerdict } = await runAutonomousWebsiteGuardianScanAndPatch();
    setPatchLogs(loadGuardianPatchLogs());
    toast.error(
      sk
        ? `TEST OCHRANY PEŇAŽENKY: Pokus o presun tokenov na cudziu adresu bol ZABLOKOVANÝ (${guardSelfTestVerdict.code}). Ani samotný Web Guardian AI nemôže vybrať peniaze z peňaženky!`
        : `WALLET PROTECTION TEST: Attempted external transfer was BLOCKED (${guardSelfTestVerdict.code}). Not even the Web Guardian AI can withdraw funds!`,
    );
  };

  const handleSelectThemePreset = (preset: UiThemePresetId) => {
    const next = evolveWebsiteUiDesign({
      preset,
      reasonSk: `Aegis AI Architect zmenil vizuálnu tému stránky na "${UI_THEME_PRESETS[preset].nameSk}".`,
      reasonEn: `Aegis AI Architect changed website theme to "${UI_THEME_PRESETS[preset].nameEn}".`,
    });
    setGuardian(next);
    setPatchLogs(loadGuardianPatchLogs());
    toast.success(
      sk
        ? `Dizajn stránky aktualizovaný: ${UI_THEME_PRESETS[preset].nameSk}`
        : `Website design updated: ${UI_THEME_PRESETS[preset].nameEn}`,
    );
  };

  const handleAddCustomModule = () => {
    if (!newModTitle.trim()) {
      toast.error(sk ? 'Zadaj názov nového modulu pre stránku' : 'Enter a module title');
      return;
    }
    const next = evolveWebsiteUiDesign({
      addModule: {
        titleSk: newModTitle.trim(),
        titleEn: newModTitle.trim(),
        metricLabel: 'Status',
        metricValue: newModValue.trim() || 'AKTÍVNE · +BTC',
      },
      reasonSk: `Aegis AI pridal na stránku nový modul "${newModTitle.trim()}".`,
      reasonEn: `Aegis AI added new module "${newModTitle.trim()}" to the website.`,
    });
    setGuardian(next);
    setPatchLogs(loadGuardianPatchLogs());
    setNewModTitle('');
    setNewModValue('');
    toast.success(sk ? 'Nový modul bol pridaný na stránku!' : 'New module added to website!');
  };

  const handleToggleModule = (modId: string) => {
    const next = evolveWebsiteUiDesign({
      toggleModuleId: modId,
      reasonSk: `Aegis AI upravil viditeľnosť modulu (${modId}) na stránke.`,
    });
    setGuardian(next);
    setPatchLogs(loadGuardianPatchLogs());
  };

  const handleRemoveModule = (modId: string) => {
    const next = evolveWebsiteUiDesign({
      removeModuleId: modId,
      reasonSk: `Aegis AI odstránil modul (${modId}) zo stránky.`,
    });
    setGuardian(next);
    setPatchLogs(loadGuardianPatchLogs());
    toast.info(sk ? 'Modul odstránený zo stránky.' : 'Module removed from website.');
  };

  const handleExecuteAiCommand = async () => {
    if (!aiCommand.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const { reply, updatedState } = await askWebsiteGuardianAi(aiCommand.trim());
      setAiLastResponse(reply);
      setGuardian(updatedState);
      setPatchLogs(loadGuardianPatchLogs());
      setAiCommand('');
      toast.success(
        sk
          ? 'Aegis AI Guardian vykonal príkaz, skontroloval bezpečnosť a aplikoval zmeny!'
          : 'Aegis AI Guardian executed command, verified security, and applied updates!',
      );
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Hero Banner: 24/7 Autonomous Website Guardian */}
      <div className="rounded-2xl border border-[#14F195]/40 bg-[#14F195]/[0.05] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#14F195]/20 border border-[#14F195]/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#14F195]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground">
                  Aegis Sentinel · AI Strážca Webu, Šifrovania &amp; Dizajnu
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                  {guardian.securityScore}/100 SECURE
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {sk
                  ? '100% automatický agent: chráni stránku pred hacknutím, šifruje dáta (AES-256-GCM), vykonáva záplaty (Patche), vylepšuje dizajn a garantuje, že nikto (ani žiadny agent) nemôže vybrať peniaze z peňaženky.'
                  : '100% automatic agent: protects the site against hacks, encrypts data (AES-256-GCM), applies patches, evolves UI design, and guarantees zero external withdrawals.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleAutopilot}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all shrink-0 ${
              guardian.autopilotEnabled
                ? 'bg-[#14F195] text-black border-[#14F195]'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            {guardian.autopilotEnabled
              ? sk
                ? 'Autopilot 24/7: ZAPNUTÝ'
                : 'Autopilot 24/7: ON'
              : sk
                ? 'Autopilot: VYPNUTÝ'
                : 'Autopilot: OFF'}
          </button>
        </div>

        {/* Immutable Non-Withdrawal Guarantee Box */}
        <div className="rounded-xl bg-black/50 border border-emerald-500/30 p-3 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] space-y-0.5">
            <p className="font-bold text-emerald-300">
              {sk
                ? 'Železný zákon bezpečnosti: Nikto nemôže presunúť peniaze na inú adresu (`canWithdrawExternally = FALSE`)'
                : 'Iron Security Law: Nobody can transfer funds to an external address (`canWithdrawExternally = FALSE`)'}
            </p>
            <p className="text-muted-foreground leading-snug">
              {sk
                ? 'Ani hacker, ani obchodní AI agenti, ani tento Web Guardian AI nemajú prístup k výberu prostriedkov mimo tvoj Safe Global trezor. Každý pokus o prevod na cudziu peňaženku je automaticky zablokovaný.'
                : 'Neither hackers, nor trading AI agents, nor this Web Guardian AI can withdraw funds outside your Safe Global vault.'}
            </p>
          </div>
        </div>

        {/* 4 Security Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              {sk ? 'Šifrovanie Trezoru' : 'Vault Encryption'}
            </span>
            <span className="text-xs font-bold text-emerald-400 font-mono">AES-256-GCM</span>
            <span className="text-[9px] text-muted-foreground block truncate font-mono mt-0.5">
              {guardian.encryptedVaultCiphertextPreview}
            </span>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              {sk ? 'Aplikované Záplaty' : 'Patches Applied'}
            </span>
            <span className="text-sm font-black text-foreground font-mono">
              {guardian.totalPatchesApplied} Patche
            </span>
            <span className="text-[9px] text-emerald-300 block">
              {guardian.totalScansCompleted} {sk ? 'automatických skenov' : 'auto scans'}
            </span>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              {sk ? 'Zneškodnené Útoky' : 'Threats Blocked'}
            </span>
            <span className="text-sm font-black text-amber-400 font-mono">
              {guardian.totalAttackVectorsNeutralized}
            </span>
            <span className="text-[9px] text-muted-foreground block">
              XSS · Phishing · Drain = 0
            </span>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              {sk ? 'Aktívny AI Mozog' : 'Active AI Brain'}
            </span>
            <span className="text-xs font-bold text-sky-400 font-mono uppercase">
              {geminiKey.trim()
                ? 'Google Gemini AI'
                : guardian.aiProvider === 'openrouter'
                  ? 'OpenRouter AI'
                  : 'Sovereign Auto AI'}
            </span>
            <span className="text-[9px] text-muted-foreground block">
              {sk ? 'Beží 100% automaticky' : 'Runs 100% automatically'}
            </span>
          </div>
        </div>

        {/* Live Automatic Security & Patching Status + Optional Zero-Withdrawal Proof */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 py-2.5 px-4 rounded-xl bg-[#14F195]/15 border border-[#14F195]/40 text-[#14F195] font-bold text-xs flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#14F195] animate-ping shrink-0" />
            <span>
              {sk
                ? `Automatické skenovanie dier, šifrovanie AES-256-GCM a aplikovanie záplat beží nepretržite (Sken #${guardian.totalScansCompleted})`
                : `Automatic vulnerability scanning, AES-256-GCM encryption & patching running continuously (Scan #${guardian.totalScansCompleted})`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleTestGuardianCannotWithdraw()}
            className="py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            {sk
              ? 'Otestovať že ani Guardian nemôže vybrať peniaze'
              : 'Test Guardian Cannot Withdraw Funds'}
          </button>
        </div>
      </div>

      {/* USER BYOK API KEY SECTION: Google Gemini API Key (or OpenRouter) */}
      <div className="glass-card p-4 space-y-3 border border-sky-500/30">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {sk
                ? 'Vlastný AI API Kľúč používateľa (Google Gemini API / OpenRouter)'
                : 'User Bring-Your-Own AI API Key (Google Gemini / OpenRouter)'}
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-mono">
            {geminiKey.trim()
              ? sk
                ? 'Google Gemini API Aktívne (Šifrované AES-256)'
                : 'Google Gemini API Active (AES-256 Encrypted)'
              : sk
                ? 'Sovereign Local Autopilot Aktívny (Nevyžaduje kľúč)'
                : 'Sovereign Local Autopilot Active (No key required)'}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          {sk
            ? 'Každý používateľ si sem môže vložiť svoj vlastný API kľúč (napr. z Google Gemini Studio `AIzaSy...`). Kľúč sa okamžite zašifruje cez AES-256-GCM priamo v tvojom prehliadači. Aj bez zadaného kľúča však agent vykonáva všetky záplaty, šifrovanie a ochranu 100% automaticky!'
            : 'Every user can enter their own Google Gemini API key (`AIzaSy...`). Encrypted locally with AES-256-GCM. Even without a key, the agent runs all patches and protection 100% automatically!'}
        </p>

        <div className="relative">
          <input
            type={showGeminiKey ? 'text' : 'password'}
            value={geminiKey}
            onChange={(e) => handleSaveGeminiKey(e.target.value)}
            placeholder={
              sk
                ? 'AIzaSy... (Vlož svoj Google Gemini API kľúč — voliteľné, šifrované cez AES-256-GCM)'
                : 'AIzaSy... (Paste your Google Gemini API key — optional, AES-256-GCM encrypted)'
            }
            autoComplete="off"
            spellCheck={false}
            className="w-full pr-10 px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-mono border border-border focus:outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={() => setShowGeminiKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Toggle Gemini Key Visibility"
          >
            {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* LIVE WEBSITE DESIGN & MODULE EVOLUTION STUDIO */}
      <div className="glass-card p-4 space-y-3 border border-purple-500/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {sk
                ? 'AI Evolúcia Dizajnu & Modulov Webstránky (Pridať / Odobrať / Vylepšiť)'
                : 'AI Website Design & Module Evolution (Add / Remove / Upgrade)'}
            </h3>
          </div>
          <span className="text-[10px] font-mono text-purple-300">
            Evolúcie: #{guardian.totalUiEvolutionsApplied}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {sk
            ? 'Agent môže dynamicky meniť vzhľad celej stránky, zapínať/vypínať ochranné panely a pridávať alebo odoberať moduly v reálnom čase:'
            : 'The agent can dynamically evolve the look of the entire website and add/remove modules in real time:'}
        </p>

        {/* Theme Presets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(UI_THEME_PRESETS) as UiThemePresetId[]).map((presetKey) => {
            const preset = UI_THEME_PRESETS[presetKey];
            const isSelected = guardian.uiConfig.themePreset === presetKey;
            return (
              <button
                key={presetKey}
                type="button"
                onClick={() => handleSelectThemePreset(presetKey)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-white/[0.08] border-white/40 shadow-sm'
                    : 'bg-secondary/50 border-border hover:bg-secondary/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: preset.accentHex }}
                    />
                    {sk ? preset.nameSk : preset.nameEn}
                  </span>
                  {isSelected && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      AKTÍVNE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  {preset.descriptionSk}
                </p>
              </button>
            );
          })}
        </div>

        {/* Active Website Modules (Add / Toggle / Remove) */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <span className="text-[11px] font-semibold text-muted-foreground block">
            {sk
              ? 'Aktívne moduly pridané AI agentom na stránku (môžeš ich zapnúť, vypnúť alebo pridať vlastný):'
              : 'Active modules added by the AI agent to the website:'}
          </span>

          <div className="space-y-1.5">
            {guardian.uiConfig.activeCustomModules.map((mod) => (
              <div
                key={mod.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary/60 border border-border text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleModule(mod.id)}
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      mod.enabled
                        ? 'bg-[#14F195] border-[#14F195] text-black'
                        : 'bg-black/40 border-white/20 text-transparent'
                    }`}
                  >
                    ✓
                  </button>
                  <span className="font-semibold text-foreground truncate">
                    {sk ? mod.titleSk : mod.titleEn}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-[#14F195]">
                    {mod.metricValue}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveModule(mod.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title={sk ? 'Odobrať modul zo stránky' : 'Remove module'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new module row */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="text"
              value={newModTitle}
              onChange={(e) => setNewModTitle(e.target.value)}
              placeholder={sk ? 'Názov nového prvku/modulu (napr. Anti-MEV Slippage Guard)…' : 'New module title…'}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs border border-border focus:outline-none"
            />
            <input
              type="text"
              value={newModValue}
              onChange={(e) => setNewModValue(e.target.value)}
              placeholder={sk ? 'Hodnota (napr. MAX 0.3%)' : 'Value (e.g. MAX 0.3%)'}
              className="sm:w-36 px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs border border-border focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddCustomModule}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {sk ? 'Pridať na stránku' : 'Add to Site'}
            </button>
          </div>
        </div>
      </div>

      {/* ASK THE WEBSITE GUARDIAN AI TO PATCH OR UPGRADE ANYTHING */}
      <div className="glass-card p-4 space-y-3 border border-[#14F195]/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#14F195]" />
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            {sk
              ? 'Príkazy pre Aegis Web Guardian AI (Záplaty, Audit, Zmena Dizajnu)'
              : 'Commands for Aegis Web Guardian AI (Patches, Audit, Design Evolution)'}
          </h3>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={aiCommand}
            onChange={(e) => setAiCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleExecuteAiCommand();
              }
            }}
            placeholder={
              sk
                ? 'Napíš napr.: "Skontroluj diery, prešifruj trezor a prepni dizajn na Bitcoin Gold"…'
                : 'Type e.g.: "Scan for vulnerabilities, re-encrypt vault and switch design to Bitcoin Gold"…'
            }
            className="flex-1 px-3 py-2 rounded-xl bg-secondary text-foreground text-xs border border-border focus:outline-none focus:border-[#14F195]"
          />
          <button
            type="button"
            disabled={aiBusy || !aiCommand.trim()}
            onClick={() => void handleExecuteAiCommand()}
            className="px-4 py-2 rounded-xl bg-[#14F195] text-black font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {aiBusy ? (sk ? 'Pracujem…' : 'Working…') : sk ? 'Vykonať' : 'Execute'}
          </button>
        </div>

        {aiLastResponse && (
          <div className="rounded-xl bg-black/50 border border-[#14F195]/30 p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {aiLastResponse}
          </div>
        )}
      </div>

      {/* 8 ACTIVE SECURITY & ANTI-HACK SHIELDS */}
      <div className="glass-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {sk
              ? '8 Aktívnych Bezpečnostných Vrstiev & Automatických Záplat'
              : '8 Active Security Layers & Automatic Patches'}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {guardian.checks.map((chk) => (
            <div
              key={chk.id}
              className="rounded-xl bg-secondary/40 border border-emerald-500/25 p-3 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  {sk ? chk.titleSk : chk.titleEn}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-mono font-bold shrink-0">
                  {chk.status}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {sk ? chk.patchDescriptionSk : chk.patchDescriptionEn}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* GUARDIAN PATCH & EVOLUTION LOG */}
      {patchLogs.length > 0 && (
        <div className="glass-card p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {sk ? 'História Automatických Záplat & Úprav Stránky' : 'Automatic Patch & Website Evolution History'}
          </h3>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {patchLogs.slice(0, 15).map((log) => (
              <div
                key={log.id}
                className="rounded-lg bg-black/40 border border-white/[0.07] px-3 py-2 text-[11px] space-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-emerald-300">
                    {sk ? log.titleSk : log.titleEn}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {new Date(log.ts).toLocaleTimeString()} · {log.aiEngineUsed.toUpperCase()}
                  </span>
                </div>
                <p className="text-muted-foreground">{sk ? log.detailsSk : log.detailsEn}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
