REVOKE EXECUTE ON FUNCTION public.get_cron_jobs_status() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs_status() TO service_role;
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS pin_hash;