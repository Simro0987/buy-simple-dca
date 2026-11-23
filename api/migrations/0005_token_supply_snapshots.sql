-- Daily circulating-supply snapshots written by the token-tokenomics server function
-- (dilution / unlock pressure). It existed only in the old drizzle/ folder and was missing
-- from the database, so every tokenomics call failed with 404.
CREATE TABLE IF NOT EXISTS public.token_supply_snapshots (
  symbol text NOT NULL,
  day date NOT NULL,
  circ_supply numeric NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, day)
);
ALTER TABLE public.token_supply_snapshots ENABLE ROW LEVEL SECURITY;
-- Server only (service_role bypasses RLS); browsers read tokenomics through the function.
GRANT ALL ON public.token_supply_snapshots TO service_role;
