
-- Track per-token DCA executions (market clicks + limit clicks)
CREATE TABLE IF NOT EXISTS public.dca_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  week_number integer NOT NULL,
  coin text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('market','limit')),
  amount_usd numeric NOT NULL,
  target_price numeric NOT NULL,
  executed_price numeric,
  quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','EXECUTED','FILLED','CANCELLED')),
  filled_at timestamptz,
  notes text
);

ALTER TABLE public.dca_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read dca_executions"   ON public.dca_executions FOR SELECT USING (true);
CREATE POLICY "Public insert dca_executions" ON public.dca_executions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update dca_executions" ON public.dca_executions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete dca_executions" ON public.dca_executions FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_dca_executions_status ON public.dca_executions(status);
CREATE INDEX IF NOT EXISTS idx_dca_executions_coin_week ON public.dca_executions(coin, week_number);
