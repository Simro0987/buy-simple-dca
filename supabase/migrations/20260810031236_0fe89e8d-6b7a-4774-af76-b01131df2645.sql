CREATE POLICY "Users delete own callback log"
ON public.telegram_callback_log
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT DELETE ON public.telegram_callback_log TO authenticated;