
-- Tighten telegram_bot_state & telegram_callback_log: authenticated read-only, no client writes
DROP POLICY IF EXISTS "Authenticated full access" ON public.telegram_bot_state;
DROP POLICY IF EXISTS "Authenticated read only" ON public.telegram_bot_state;
CREATE POLICY "Authenticated read only" ON public.telegram_bot_state
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.telegram_bot_state FROM authenticated;
GRANT SELECT ON public.telegram_bot_state TO authenticated;
GRANT ALL ON public.telegram_bot_state TO service_role;

DROP POLICY IF EXISTS "Authenticated full access" ON public.telegram_callback_log;
DROP POLICY IF EXISTS "Authenticated read only" ON public.telegram_callback_log;
CREATE POLICY "Authenticated read only" ON public.telegram_callback_log
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.telegram_callback_log FROM authenticated;
GRANT SELECT ON public.telegram_callback_log TO authenticated;
GRANT ALL ON public.telegram_callback_log TO service_role;

-- Ensure per-user uniqueness on weekly_fill_snapshots
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.weekly_fill_snapshots'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.weekly_fill_snapshots DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS public.weekly_fill_snapshots_week_number_coin_key;
ALTER TABLE public.weekly_fill_snapshots
  ADD CONSTRAINT weekly_fill_snapshots_user_week_coin_uk
  UNIQUE (user_id, week_number, coin);
