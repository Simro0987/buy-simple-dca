-- pg_cron replacement: the API's in-process scheduler records its jobs/runs here, so the
-- existing public.get_cron_jobs_status() (CronJobsCard in the UI) keeps working unchanged.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid     bigserial PRIMARY KEY,
  jobname   text NOT NULL UNIQUE,
  schedule  text NOT NULL,
  active    boolean NOT NULL DEFAULT true,
  command   text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cron.job_run_details (
  runid          bigserial PRIMARY KEY,
  jobid          bigint NOT NULL REFERENCES cron.job(jobid) ON DELETE CASCADE,
  status         text NOT NULL,
  return_message text,
  start_time     timestamptz NOT NULL DEFAULT now(),
  end_time       timestamptz
);
CREATE INDEX IF NOT EXISTS job_run_details_job_time_idx ON cron.job_run_details (jobid, start_time DESC);
REVOKE ALL ON SCHEMA cron FROM PUBLIC;

-- Privileges like Supabase's, minus anon: every table has RLS with policies only for
-- `authenticated`, so anonymous requests get "permission denied" instead of empty sets.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_cron_jobs_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs_status() TO authenticated, service_role;
