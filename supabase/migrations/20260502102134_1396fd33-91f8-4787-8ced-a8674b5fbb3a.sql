-- Self-learning DCA engine: outcomes log + adaptive parameters

-- 1) Outcomes: po každom DCA týždni zapíšeme čo sa stalo
CREATE TABLE public.learning_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number INTEGER NOT NULL,
  evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- parametre použité v danom týždni
  params_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- výsledky per coin: { btc: {avg_buy, price_after_7d, fill_rate, price_delta_pct}, eth:..., sol:... }
  per_coin_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- agregované metriky
  avg_price_delta_7d NUMERIC,        -- (price_after_7d / avg_buy - 1) * 100, priemer cez coiny
  avg_fill_rate NUMERIC,              -- 0-100, priemer cez coiny
  reward_score NUMERIC,               -- finálna odmena -100..+100
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read learning_outcomes" ON public.learning_outcomes FOR SELECT USING (true);
CREATE POLICY "Public insert learning_outcomes" ON public.learning_outcomes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update learning_outcomes" ON public.learning_outcomes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete learning_outcomes" ON public.learning_outcomes FOR DELETE USING (true);

CREATE INDEX idx_learning_outcomes_week ON public.learning_outcomes(week_number DESC);

-- 2) Adaptive parametre — engine ich sám upravuje
CREATE TABLE public.engine_params (
  id INTEGER PRIMARY KEY DEFAULT 1,
  -- base split (pôvodne 85→30 market, -1.5→-6.5 distance)
  base_market_high NUMERIC NOT NULL DEFAULT 85,    -- market % pri score=0
  base_market_low NUMERIC NOT NULL DEFAULT 30,     -- market % pri score=100
  base_distance_low NUMERIC NOT NULL DEFAULT -1.5, -- distance pri score=0
  base_distance_high NUMERIC NOT NULL DEFAULT -6.5,-- distance pri score=100
  -- váhy faktorov v score (sum ~ 1.0)
  weight_flush NUMERIC NOT NULL DEFAULT 0.25,
  weight_trend NUMERIC NOT NULL DEFAULT 0.25,
  weight_sentiment NUMERIC NOT NULL DEFAULT 0.20,
  weight_onchain NUMERIC NOT NULL DEFAULT 0.15,
  weight_risk NUMERIC NOT NULL DEFAULT 0.15,
  -- volatility / momentum multipliers
  volatility_sensitivity NUMERIC NOT NULL DEFAULT 0.25, -- mult koeficient
  momentum_sensitivity NUMERIC NOT NULL DEFAULT 0.6,
  -- meta
  iteration INTEGER NOT NULL DEFAULT 0,
  last_reward NUMERIC,
  last_change_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_step_pct NUMERIC NOT NULL DEFAULT 10, -- max zmena za tick v %
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT engine_params_singleton CHECK (id = 1)
);

ALTER TABLE public.engine_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read engine_params" ON public.engine_params FOR SELECT USING (true);
CREATE POLICY "Public insert engine_params" ON public.engine_params FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update engine_params" ON public.engine_params FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.engine_params (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER engine_params_updated_at
  BEFORE UPDATE ON public.engine_params
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();