ALTER TABLE public.telegram_callback_log ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.telegram_callback_log l
SET user_id = (SELECT c.user_id FROM public.telegram_config c WHERE c.user_id IS NOT NULL ORDER BY c.updated_at DESC LIMIT 1)
WHERE l.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_callback_log_user_id ON public.telegram_callback_log(user_id);

DROP POLICY IF EXISTS "Authenticated read only" ON public.telegram_callback_log;

CREATE POLICY "Users read own callback log"
ON public.telegram_callback_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT ON public.telegram_callback_log TO authenticated;
GRANT ALL ON public.telegram_callback_log TO service_role;