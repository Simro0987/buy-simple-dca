ALTER TABLE public.telegram_sent_messages ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY "auth can read sent messages" ON public.telegram_sent_messages;
DROP POLICY "auth can delete sent messages" ON public.telegram_sent_messages;

CREATE POLICY "own sent messages select" ON public.telegram_sent_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own sent messages delete" ON public.telegram_sent_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());