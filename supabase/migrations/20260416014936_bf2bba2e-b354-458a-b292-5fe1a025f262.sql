
SELECT cron.schedule(
  'poll-telegram-callbacks',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://ctykeosgiekmdhgdcvgc.supabase.co/functions/v1/telegram-poll-callbacks',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eWtlb3NnaWVrbWRoZ2RjdmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzk0MTEsImV4cCI6MjA5MDcxNTQxMX0.v_vVAZ4vWVRrGU5quNVWOkbHDVE6qmcWchOyQqEXjgI"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
