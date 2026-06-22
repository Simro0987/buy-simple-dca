-- Daily risk report at 19:00 SEČ (18:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-risk-report-19cet');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'daily-risk-report-19cet',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url:='https://ctykeosgiekmdhgdcvgc.supabase.co/functions/v1/telegram-daily-risk-report',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eWtlb3NnaWVrbWRoZ2RjdmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzk0MTEsImV4cCI6MjA5MDcxNTQxMX0.v_vVAZ4vWVRrGU5quNVWOkbHDVE6qmcWchOyQqEXjgI"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
