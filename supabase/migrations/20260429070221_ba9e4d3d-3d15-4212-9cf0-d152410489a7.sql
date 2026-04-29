ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS initial_cost_basis jsonb NOT NULL DEFAULT '{"btc": 0, "eth": 0, "sol": 0}'::jsonb;