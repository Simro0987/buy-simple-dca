DROP POLICY IF EXISTS "Authenticated read only" ON public.telegram_bot_state;
DROP POLICY IF EXISTS "Authenticated full access" ON public.telegram_bot_state;
REVOKE ALL ON public.telegram_bot_state FROM authenticated;
REVOKE ALL ON public.telegram_bot_state FROM anon;
GRANT ALL ON public.telegram_bot_state TO service_role;
ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;