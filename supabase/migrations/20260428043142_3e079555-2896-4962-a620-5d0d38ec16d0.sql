ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS manual_holdings jsonb NOT NULL DEFAULT '{"btc": 0, "eth": 0, "sol": 0}'::jsonb;