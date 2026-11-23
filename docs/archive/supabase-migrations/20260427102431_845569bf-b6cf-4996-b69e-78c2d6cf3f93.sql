-- ============================================
-- Buy Simple DCA - Schema
-- ============================================

-- Helper: updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================
-- app_settings (single-row)
-- ============================================
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_hash text,
  btc_address text,
  eth_address text,
  eth_arb_address text,
  sol_address text,
  sol_arb_address text,
  wsteth_contract text NOT NULL DEFAULT '0x5979D7b546E38E414F7E9822514be443A4800529',
  jitosol_contract text NOT NULL DEFAULT '0x83e1d2310Ade410676B1733d16e89f91822FD5c3',
  etherscan_api_key text,
  arbiscan_api_key text,
  helius_api_key text,
  dca_frequency text NOT NULL DEFAULT 'weekly',
  dca_day text NOT NULL DEFAULT 'Monday',
  default_amount numeric NOT NULL DEFAULT 0,
  total_capital numeric NOT NULL DEFAULT 0,
  dca_horizon_weeks integer NOT NULL DEFAULT 52,
  rebalance_threshold numeric NOT NULL DEFAULT 5,
  theme text NOT NULL DEFAULT 'dark',
  telegram_token text,
  telegram_chat_id text,
  staking_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_base_allocations jsonb NOT NULL DEFAULT '{"0-20":75,"20-40":65,"40-60":55,"60-80":40,"80-100":25}'::jsonb,
  regime_multipliers jsonb NOT NULL DEFAULT '{"BULL":1.00,"SIDEWAYS":0.85,"BEAR":1.15,"PANIC":1.30,"EUPHORIA":0.60}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read app_settings"   ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Public insert app_settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update app_settings" ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete app_settings" ON public.app_settings FOR DELETE USING (true);
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed single row
INSERT INTO public.app_settings (id) VALUES (gen_random_uuid());

-- ============================================
-- dca_purchases
-- ============================================
CREATE TABLE public.dca_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  week_number integer NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  btc_amount numeric NOT NULL DEFAULT 0,
  eth_amount numeric NOT NULL DEFAULT 0,
  sol_amount numeric NOT NULL DEFAULT 0,
  btc_price numeric NOT NULL DEFAULT 0,
  eth_price numeric NOT NULL DEFAULT 0,
  sol_price numeric NOT NULL DEFAULT 0,
  market_amount numeric NOT NULL DEFAULT 0,
  limit_amount numeric NOT NULL DEFAULT 0,
  score integer,
  regime text,
  allocation_pct numeric,
  notes text
);
ALTER TABLE public.dca_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read dca_purchases"   ON public.dca_purchases FOR SELECT USING (true);
CREATE POLICY "Public insert dca_purchases" ON public.dca_purchases FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update dca_purchases" ON public.dca_purchases FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete dca_purchases" ON public.dca_purchases FOR DELETE USING (true);
CREATE INDEX idx_dca_purchases_week ON public.dca_purchases(week_number DESC);
CREATE INDEX idx_dca_purchases_created ON public.dca_purchases(created_at DESC);

-- ============================================
-- weekly_scores
-- ============================================
CREATE TABLE public.weekly_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  week_number integer NOT NULL,
  score integer NOT NULL,
  regime text NOT NULL,
  flush_score integer,
  trend_score integer,
  sentiment_score integer,
  onchain_score integer,
  risk_score integer,
  base_allocation numeric,
  regime_multiplier numeric,
  final_allocation numeric,
  weekly_capital numeric,
  invested_amount numeric,
  cash_reserve numeric
);
ALTER TABLE public.weekly_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read weekly_scores"   ON public.weekly_scores FOR SELECT USING (true);
CREATE POLICY "Public insert weekly_scores" ON public.weekly_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update weekly_scores" ON public.weekly_scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete weekly_scores" ON public.weekly_scores FOR DELETE USING (true);
CREATE INDEX idx_weekly_scores_week ON public.weekly_scores(week_number DESC);

-- ============================================
-- limit_orders
-- ============================================
CREATE TABLE public.limit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  coin text NOT NULL,
  limit_price numeric NOT NULL,
  amount_usd numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  filled_at timestamptz,
  week_number integer NOT NULL
);
ALTER TABLE public.limit_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read limit_orders"   ON public.limit_orders FOR SELECT USING (true);
CREATE POLICY "Public insert limit_orders" ON public.limit_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update limit_orders" ON public.limit_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete limit_orders" ON public.limit_orders FOR DELETE USING (true);
CREATE INDEX idx_limit_orders_status ON public.limit_orders(status);

-- ============================================
-- capital_entries
-- ============================================
CREATE TABLE public.capital_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'MONTHLY',
  note text
);
ALTER TABLE public.capital_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read capital_entries"   ON public.capital_entries FOR SELECT USING (true);
CREATE POLICY "Public insert capital_entries" ON public.capital_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update capital_entries" ON public.capital_entries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete capital_entries" ON public.capital_entries FOR DELETE USING (true);

-- ============================================
-- staking_rewards
-- ============================================
CREATE TABLE public.staking_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  month text NOT NULL,
  btc_reward numeric NOT NULL DEFAULT 0,
  eth_reward numeric NOT NULL DEFAULT 0,
  sol_reward numeric NOT NULL DEFAULT 0,
  total_usd numeric NOT NULL DEFAULT 0
);
ALTER TABLE public.staking_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read staking_rewards"   ON public.staking_rewards FOR SELECT USING (true);
CREATE POLICY "Public insert staking_rewards" ON public.staking_rewards FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update staking_rewards" ON public.staking_rewards FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete staking_rewards" ON public.staking_rewards FOR DELETE USING (true);
CREATE INDEX idx_staking_rewards_month ON public.staking_rewards(month DESC);