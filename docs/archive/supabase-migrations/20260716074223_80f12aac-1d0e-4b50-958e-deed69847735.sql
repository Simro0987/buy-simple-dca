
-- staking_positions: manuálny staking ledger per user
CREATE TABLE public.staking_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL CHECK (symbol IN ('BTC','ETH','SOL')),
  protocol TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, protocol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staking_positions TO authenticated;
GRANT ALL ON public.staking_positions TO service_role;
ALTER TABLE public.staking_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own staking_positions" ON public.staking_positions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER staking_positions_set_updated_at
  BEFORE UPDATE ON public.staking_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- defi_positions: jeden riadok per user; JSON blob pre ETH dlh, USDC dlh a confirmed steps
CREATE TABLE public.defi_positions (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  eth_debt DOUBLE PRECISION NOT NULL DEFAULT 0,
  usdc_debt DOUBLE PRECISION NOT NULL DEFAULT 0,
  confirmed_steps JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defi_positions TO authenticated;
GRANT ALL ON public.defi_positions TO service_role;
ALTER TABLE public.defi_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own defi_positions" ON public.defi_positions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER defi_positions_set_updated_at
  BEFORE UPDATE ON public.defi_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
