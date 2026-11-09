
-- ============================================================
-- 1) WIPE transactional data (clean slate)
-- ============================================================
TRUNCATE TABLE
  public.dca_purchases,
  public.capital_entries,
  public.dca_executions,
  public.limit_orders,
  public.staking_rewards,
  public.weekly_scores,
  public.weekly_fill_snapshots,
  public.learning_outcomes
RESTART IDENTITY;

-- ============================================================
-- 2) Resolve target user (first auth user) for backfill
-- ============================================================
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'No auth.users yet – user_id columns will be nullable until a user signs up.';
  END IF;

  -- ---------- app_settings ----------
  ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_uid IS NOT NULL THEN
    UPDATE public.app_settings SET user_id = v_uid WHERE user_id IS NULL;
    ALTER TABLE public.app_settings ALTER COLUMN user_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS app_settings_user_id_uidx ON public.app_settings(user_id);
  END IF;

  -- ---------- engine_params ----------
  ALTER TABLE public.engine_params ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_uid IS NOT NULL THEN
    UPDATE public.engine_params SET user_id = v_uid WHERE user_id IS NULL;
    ALTER TABLE public.engine_params ALTER COLUMN user_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS engine_params_user_id_uidx ON public.engine_params(user_id);
  END IF;

  -- ---------- telegram_config ----------
  ALTER TABLE public.telegram_config ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_uid IS NOT NULL THEN
    UPDATE public.telegram_config SET user_id = v_uid WHERE user_id IS NULL;
    ALTER TABLE public.telegram_config ALTER COLUMN user_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS telegram_config_user_id_uidx ON public.telegram_config(user_id);
  END IF;

  -- ---------- transactional tables (already wiped) ----------
  ALTER TABLE public.dca_purchases          ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.capital_entries        ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.dca_executions         ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.limit_orders           ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.staking_rewards        ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.weekly_scores          ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.weekly_fill_snapshots  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.learning_outcomes      ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

CREATE INDEX IF NOT EXISTS dca_purchases_user_id_idx         ON public.dca_purchases(user_id);
CREATE INDEX IF NOT EXISTS capital_entries_user_id_idx       ON public.capital_entries(user_id);
CREATE INDEX IF NOT EXISTS dca_executions_user_id_idx        ON public.dca_executions(user_id);
CREATE INDEX IF NOT EXISTS limit_orders_user_id_idx          ON public.limit_orders(user_id);
CREATE INDEX IF NOT EXISTS staking_rewards_user_id_idx       ON public.staking_rewards(user_id);
CREATE INDEX IF NOT EXISTS weekly_scores_user_id_idx         ON public.weekly_scores(user_id);
CREATE INDEX IF NOT EXISTS weekly_fill_snapshots_user_id_idx ON public.weekly_fill_snapshots(user_id);
CREATE INDEX IF NOT EXISTS learning_outcomes_user_id_idx     ON public.learning_outcomes(user_id);

-- ============================================================
-- 3) Replace permissive policies with per-user RLS
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_settings','engine_params','telegram_config',
    'dca_purchases','capital_entries','dca_executions','limit_orders',
    'staking_rewards','weekly_scores','weekly_fill_snapshots','learning_outcomes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users manage own rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users manage own rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ============================================================
-- 4) New table: tracked_tokens (user-added custom tokens)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.token_category AS ENUM ('core','yield','satellite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tracked_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coingecko_id  text NOT NULL,
  symbol        text NOT NULL,
  name          text NOT NULL,
  image_url     text,
  category      public.token_category NOT NULL DEFAULT 'satellite',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, coingecko_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_tokens TO authenticated;
GRANT ALL ON public.tracked_tokens TO service_role;
ALTER TABLE public.tracked_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own tracked tokens" ON public.tracked_tokens;
CREATE POLICY "Users manage own tracked tokens" ON public.tracked_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS tracked_tokens_user_id_idx ON public.tracked_tokens(user_id);

DROP TRIGGER IF EXISTS trg_tracked_tokens_updated_at ON public.tracked_tokens;
CREATE TRIGGER trg_tracked_tokens_updated_at
  BEFORE UPDATE ON public.tracked_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5) New table: token_transactions (manual buy/sell per token)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.tx_side AS ENUM ('buy','sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.token_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coingecko_id  text NOT NULL,
  symbol        text NOT NULL,
  side          public.tx_side NOT NULL,
  quantity      numeric NOT NULL CHECK (quantity > 0),
  price_usd     numeric NOT NULL CHECK (price_usd >= 0),
  executed_at   timestamptz NOT NULL DEFAULT now(),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.token_transactions TO authenticated;
GRANT ALL ON public.token_transactions TO service_role;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own token tx" ON public.token_transactions;
CREATE POLICY "Users manage own token tx" ON public.token_transactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS token_transactions_user_id_idx ON public.token_transactions(user_id);
CREATE INDEX IF NOT EXISTS token_transactions_user_coin_idx ON public.token_transactions(user_id, coingecko_id);
