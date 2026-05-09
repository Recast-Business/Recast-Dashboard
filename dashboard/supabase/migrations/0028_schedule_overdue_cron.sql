-- 0028_schedule_overdue_cron.sql
-- Phase K-3 follow-up: schedule mark_overdue_payments() to run daily
-- via pg_cron. Replaces the per-page-load client-side call that was
-- fighting manual status edits.
--
-- Runs at 00:05 UTC every day. The function is idempotent — running
-- it twice in one day is fine, and rows already 'overdue' aren't
-- touched. Manual edits made during the day will be flipped the next
-- morning if (status='unpaid' AND period past EOM) is still true.
--
-- Verify after running:
--   select * from cron.job where jobname = 'overdue-payments-daily';
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'overdue-payments-daily')
--    order by start_time desc limit 5;
--
-- pg_cron is available on every Supabase tier as of mid-2024; this
-- migration enables the extension if it isn't already on. The cron
-- schema lives in the `postgres` database — jobs run as superuser
-- so RLS doesn't apply.

create extension if not exists pg_cron;

-- Idempotent: drop the old job if it already exists (e.g. re-running).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'overdue-payments-daily') then
    perform cron.unschedule('overdue-payments-daily');
  end if;
end $$;

select cron.schedule(
  'overdue-payments-daily',
  '5 0 * * *',
  $$ select mark_overdue_payments(); $$
);

comment on extension pg_cron is
  'Phase K-3: scheduled jobs. Currently used by overdue-payments-daily.';
