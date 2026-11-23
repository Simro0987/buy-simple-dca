-- Add ARB wallet fields and holdings strategy storage to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS holdings_strategy jsonb NOT NULL DEFAULT '{"BTC":{"hold":100,"staking":0,"lending":0,"trading":0},"ETH":{"hold":50,"staking":40,"lending":10,"trading":0},"SOL":{"hold":30,"staking":50,"lending":20,"trading":0}}'::jsonb,
  ADD COLUMN IF NOT EXISTS yield_apys jsonb NOT NULL DEFAULT '{"BTC":{"staking":0,"lending":2,"trading":0},"ETH":{"staking":3.2,"lending":1.8,"trading":0},"SOL":{"staking":7.5,"lending":4.2,"trading":0}}'::jsonb,
  ADD COLUMN IF NOT EXISTS arb_addresses jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Allow saving extra data on dca_purchases for execution plan tracking
ALTER TABLE public.limit_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;