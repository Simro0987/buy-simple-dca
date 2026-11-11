CREATE TABLE public.telegram_sent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  chat_id TEXT NOT NULL,
  message_id BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dca',
  token TEXT,
  leg TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tg_sent_chat ON public.telegram_sent_messages (chat_id);
CREATE INDEX idx_tg_sent_token_leg ON public.telegram_sent_messages (token, leg);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_sent_messages TO authenticated;
GRANT ALL ON public.telegram_sent_messages TO service_role;

ALTER TABLE public.telegram_sent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can read sent messages" ON public.telegram_sent_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can delete sent messages" ON public.telegram_sent_messages
  FOR DELETE TO authenticated USING (true);