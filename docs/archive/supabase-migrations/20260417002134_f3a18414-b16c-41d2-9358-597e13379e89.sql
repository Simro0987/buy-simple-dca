CREATE OR REPLACE FUNCTION public.get_cron_jobs_status()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_run_started timestamptz,
  last_run_status text,
  last_run_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    r.start_time AS last_run_started,
    r.status AS last_run_status,
    r.return_message AS last_run_message
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, status, return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) r ON true
  ORDER BY j.jobid;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_jobs_status() TO anon, authenticated;