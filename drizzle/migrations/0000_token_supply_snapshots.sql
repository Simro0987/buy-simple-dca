CREATE TABLE public.token_supply_snapshots (
  symbol text NOT NULL,
  day date NOT NULL,
  circ_supply numeric NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, day)
);
GRANT ALL ON public.token_supply_snapshots TO service_role;
ALTER TABLE public.token_supply_snapshots ENABLE ROW LEVEL SECURITY;