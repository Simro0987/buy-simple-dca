ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS dynamic_execution_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.weekly_scores
  ADD COLUMN IF NOT EXISTS btc_market_pct numeric,
  ADD COLUMN IF NOT EXISTS btc_limit_pct numeric,
  ADD COLUMN IF NOT EXISTS btc_limit_distance numeric,
  ADD COLUMN IF NOT EXISTS btc_volatility_30d numeric,
  ADD COLUMN IF NOT EXISTS btc_momentum_30d numeric,
  ADD COLUMN IF NOT EXISTS eth_market_pct numeric,
  ADD COLUMN IF NOT EXISTS eth_limit_pct numeric,
  ADD COLUMN IF NOT EXISTS eth_limit_distance numeric,
  ADD COLUMN IF NOT EXISTS eth_volatility_30d numeric,
  ADD COLUMN IF NOT EXISTS eth_momentum_30d numeric,
  ADD COLUMN IF NOT EXISTS sol_market_pct numeric,
  ADD COLUMN IF NOT EXISTS sol_limit_pct numeric,
  ADD COLUMN IF NOT EXISTS sol_limit_distance numeric,
  ADD COLUMN IF NOT EXISTS sol_volatility_30d numeric,
  ADD COLUMN IF NOT EXISTS sol_momentum_30d numeric;