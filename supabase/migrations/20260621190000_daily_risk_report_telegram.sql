-- Daily portfolio risk report cron (checks 19:00 SEČ inside edge function)
ALTER TABLE public.telegram_config
  ADD COLUMN IF NOT EXISTS daily_report_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_daily_report_date text NOT NULL DEFAULT '';

SELECT cron.schedule(
  'daily-portfolio-risk-report',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ctykeosgiekmdhgdcvgc.supabase.co/functions/v1/telegram-daily-risk-report',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eWtlb3NnaWVrbWRoZ2RjdmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzk0MTEsImV4cCI6MjA5MDcxNTQxMX0.v_vVAZ4vWVRrGU5quNVWOkbHDVE6qmcWchOyQqEXjgI"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
