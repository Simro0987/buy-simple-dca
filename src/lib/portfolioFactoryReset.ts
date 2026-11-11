/**
 * Portfolio Factory Reset
 * ------------------------
 * Detects legacy mock / seed data in Supabase and wipes it on mount so the
 * Portfolio always renders from a verified "source of truth" zero-state.
 *
 * Detection rules:
 *  1. `dca_purchases` or `capital_entries` rows whose `note` matches mock
 *     keywords (mock / test / seed / demo / sample / placeholder).
 *  2. `app_settings.manual_holdings` / `initial_cost_basis` that exactly
 *     match a known hardcoded fingerprint from prior builds.
 *
 * On reset:
 *  - DELETE matching rows from Supabase.
 *  - PATCH `app_settings` so holdings/cost-basis are zeroed.
 *  - Clear legacy mock localStorage keys.
 */
import { supabase } from '@/integrations/supabase/client';

const MOCK_NOTE_REGEX = /\b(mock|test|seed|demo|sample|placeholder|fixture)\b/i;

// Exact float fingerprints of previously-shipped seed data. Add new ones here
// whenever a legacy mock dataset is identified.
const MOCK_MANUAL_HOLDINGS: Array<{ btc: number; eth: number; sol: number }> = [
  { btc: 0.06026143085006913, eth: 0.8521125530926288, sol: 5.845112338609827 },
];
const MOCK_INITIAL_COST: Array<{ btc: number; eth: number; sol: number }> = [
  { btc: 4059.9703455472986, eth: 1750.6009424800004, sol: 485.9262545 },
];

const EPS = 1e-9;
const matches = (
  v: { btc?: number | null; eth?: number | null; sol?: number | null } | null | undefined,
  pool: Array<{ btc: number; eth: number; sol: number }>,
) => {
  if (!v) return false;
  const b = Number(v.btc ?? 0), e = Number(v.eth ?? 0), s = Number(v.sol ?? 0);
  return pool.some(p =>
    Math.abs(p.btc - b) < EPS && Math.abs(p.eth - e) < EPS && Math.abs(p.sol - s) < EPS,
  );
};

// Local storage keys known to carry legacy mock holdings / cached snapshots.
const MOCK_LOCAL_KEYS = [
  'smart-alloc-holdings',
  'portfolio-history-v2',
  'ai-router-profit-moved',
  'profit-reservoir-v1',
];

export interface FactoryResetResult {
  ran: boolean;
  deletedPurchases: number;
  deletedCapitalEntries: number;
  resetSettings: boolean;
  clearedLocalKeys: string[];
}

export async function runPortfolioFactoryReset(): Promise<FactoryResetResult> {
  const result: FactoryResetResult = {
    ran: false,
    deletedPurchases: 0,
    deletedCapitalEntries: 0,
    resetSettings: false,
    clearedLocalKeys: [],
  };

  // 1) Scan purchases & capital entries for mock notes
  const [purchases, capitals, settingsRes] = await Promise.all([
    supabase.from('dca_purchases').select('id, note'),
    supabase.from('capital_entries').select('id, note'),
    supabase.from('app_settings').select('id, manual_holdings, initial_cost_basis').limit(1).maybeSingle(),
  ]);

  const mockPurchaseIds = (purchases.data ?? [])
    .filter((r: any) => r?.note && MOCK_NOTE_REGEX.test(String(r.note)))
    .map((r: any) => r.id as string);
  const mockCapitalIds = (capitals.data ?? [])
    .filter((r: any) => r?.note && MOCK_NOTE_REGEX.test(String(r.note)))
    .map((r: any) => r.id as string);

  if (mockPurchaseIds.length) {
    const { error } = await supabase.from('dca_purchases').delete().in('id', mockPurchaseIds);
    if (!error) {
      result.deletedPurchases = mockPurchaseIds.length;
      result.ran = true;
    }
  }
  if (mockCapitalIds.length) {
    const { error } = await supabase.from('capital_entries').delete().in('id', mockCapitalIds);
    if (!error) {
      result.deletedCapitalEntries = mockCapitalIds.length;
      result.ran = true;
    }
  }

  // 2) Reset app_settings holdings if they match a known mock fingerprint
  const settings = settingsRes.data as unknown as
    | { id: string; manual_holdings: any; initial_cost_basis: any }
    | null;
  if (settings?.id) {
    const mhMock = matches(settings.manual_holdings, MOCK_MANUAL_HOLDINGS);
    const icMock = matches(settings.initial_cost_basis, MOCK_INITIAL_COST);
    if (mhMock || icMock) {
      const patch: { manual_holdings?: any; initial_cost_basis?: any } = {};
      if (mhMock) patch.manual_holdings = { btc: 0, eth: 0, sol: 0 };
      if (icMock) patch.initial_cost_basis = { btc: 0, eth: 0, sol: 0 };
      const { error } = await supabase.from('app_settings').update(patch).eq('id', settings.id);
      if (!error) {
        result.resetSettings = true;
        result.ran = true;
      }
    }
  }

  // 3) Clear mock localStorage keys when anything was reset
  if (result.ran && typeof window !== 'undefined') {
    for (const k of MOCK_LOCAL_KEYS) {
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k);
        result.clearedLocalKeys.push(k);
      }
    }
  }

  return result;
}
