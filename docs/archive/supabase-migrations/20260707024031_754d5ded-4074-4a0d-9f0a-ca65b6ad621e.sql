
DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'app_settings','capital_entries','dca_executions','dca_purchases',
    'engine_params','learning_outcomes','limit_orders','staking_rewards',
    'telegram_bot_state','telegram_callback_log','telegram_config',
    'weekly_fill_snapshots','weekly_scores'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop all existing policies on the table
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    -- Enable & force RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Revoke anon; grant authenticated + service_role
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- Authenticated-only full-access policy
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- Revoke cron status function from anon (keep authenticated for UI card)
REVOKE EXECUTE ON FUNCTION public.get_cron_jobs_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs_status() TO authenticated, service_role;
