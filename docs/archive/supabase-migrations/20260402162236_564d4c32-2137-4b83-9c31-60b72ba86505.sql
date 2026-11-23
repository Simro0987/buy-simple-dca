CREATE TABLE public.telegram_config (
  id int PRIMARY KEY CHECK (id = 1),
  chat_id text NOT NULL DEFAULT '',
  weekly_budget numeric NOT NULL DEFAULT 100,
  dca_reminder_enabled boolean NOT NULL DEFAULT true,
  limit_alert_enabled boolean NOT NULL DEFAULT true,
  news_alert_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_config (id) VALUES (1);

ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.telegram_config FOR SELECT USING (true);
CREATE POLICY "Allow public update" ON public.telegram_config FOR UPDATE USING (true) WITH CHECK (true);
