-- 1. Drop unused sensitive columns from app_settings
ALTER TABLE public.app_settings
  DROP COLUMN IF EXISTS helius_api_key,
  DROP COLUMN IF EXISTS etherscan_api_key,
  DROP COLUMN IF EXISTS arbiscan_api_key,
  DROP COLUMN IF EXISTS telegram_token,
  DROP COLUMN IF EXISTS telegram_chat_id;

-- 2. telegram_config: revoke public SELECT, keep writes for the single-user app
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='telegram_config' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.telegram_config', p.policyname);
  END LOOP;
END $$;

REVOKE SELECT ON public.telegram_config FROM anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.telegram_config TO anon, authenticated;
GRANT ALL ON public.telegram_config TO service_role;

-- 3. telegram_callback_log: drop chat_id column and remove from realtime publication
ALTER TABLE public.telegram_callback_log DROP COLUMN IF EXISTS chat_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'telegram_callback_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.telegram_callback_log';
  END IF;
END $$;