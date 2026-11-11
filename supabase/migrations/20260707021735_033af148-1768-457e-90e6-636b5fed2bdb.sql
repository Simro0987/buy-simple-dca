-- Fix Telegram security findings:
-- 1) telegram_callback_log was publicly readable/deletable; restrict to authenticated users.
-- 2) telegram_config lacked a SELECT policy; add one restricted to authenticated users.

-- telegram_callback_log: drop public policies
DROP POLICY IF EXISTS "Public can read callback log" ON public.telegram_callback_log;
DROP POLICY IF EXISTS "Public can delete callback log" ON public.telegram_callback_log;

-- telegram_callback_log: grant access and restrict to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_callback_log TO authenticated;
GRANT ALL ON public.telegram_callback_log TO service_role;

ALTER TABLE public.telegram_callback_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read callback log"
  ON public.telegram_callback_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete callback log"
  ON public.telegram_callback_log FOR DELETE
  TO authenticated
  USING (true);

-- telegram_config: ensure SELECT is restricted to authenticated users only
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='telegram_config' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.telegram_config', p.policyname);
  END LOOP;
END $$;

REVOKE SELECT ON public.telegram_config FROM anon;
GRANT SELECT ON public.telegram_config TO authenticated;
GRANT ALL ON public.telegram_config TO service_role;

ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read telegram config"
  ON public.telegram_config FOR SELECT
  TO authenticated
  USING (true);
