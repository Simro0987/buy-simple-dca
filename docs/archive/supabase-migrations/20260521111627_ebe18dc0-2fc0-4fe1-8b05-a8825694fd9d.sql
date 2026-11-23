CREATE TABLE IF NOT EXISTS public.weekly_fill_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number integer NOT NULL,
  coin text NOT NULL,
  filled integer NOT NULL DEFAULT 0,
  expired integer NOT NULL DEFAULT 0,
  cancelled integer NOT NULL DEFAULT 0,
  total_closed integer NOT NULL DEFAULT 0,
  fill_rate numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_number, coin)
);

ALTER TABLE public.weekly_fill_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read weekly_fill_snapshots" ON public.weekly_fill_snapshots FOR SELECT USING (true);
CREATE POLICY "Public insert weekly_fill_snapshots" ON public.weekly_fill_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update weekly_fill_snapshots" ON public.weekly_fill_snapshots FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete weekly_fill_snapshots" ON public.weekly_fill_snapshots FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS weekly_fill_snapshots_week_idx ON public.weekly_fill_snapshots (week_number DESC);