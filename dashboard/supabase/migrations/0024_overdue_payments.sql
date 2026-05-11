-- Phase H-1 — Overdue auto-flag.
--
-- A row is "overdue" when:
--   • status = 'unpaid'
--   • the entire period (period_year, period_month) is in the past, i.e.
--     the first day of the FOLLOWING month is on or before today.
--
-- e.g. on 2026-06-01 (or later), a vendor_payment row for (2026, 5) with
-- status='unpaid' should flip to 'overdue'. On 2026-05-31 it should stay
-- 'unpaid' because May isn't over yet.
--
-- Tables touched:
--   • vendor_payments
--   • tele_period_performance
--   • of_period_performance
--   • house_utility_payments
--   • house_rent_payments
--   • campaign_payments
--
-- The function is idempotent — running it twice in one day is fine, and
-- already-overdue rows aren't touched. Safe to call from the client on
-- every app load (which is what the frontend does).

create or replace function mark_overdue_payments() returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_total int := 0;
  v_n int;
begin
  -- vendor_payments
  update vendor_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- campaign_payments
  update campaign_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- tele_period_performance
  update tele_period_performance
  set status = 'overdue'
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- of_period_performance
  update of_period_performance
  set status = 'overdue'
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- house_utility_payments
  update house_utility_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- house_rent_payments
  update house_rent_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return json_build_object('total_flipped', v_total, 'ran_at', now());
end $$;

grant execute on function mark_overdue_payments() to authenticated;

comment on function mark_overdue_payments is
  'Flips status=unpaid rows past EOM to overdue across every payment table. '
  'Idempotent. Called from the client on app load — no pg_cron required.';

-- For installations on Supabase Pro (or self-hosted with pg_cron), schedule
-- daily at 00:05 UTC to keep things consistent even when nobody opens the app:
--
--   select cron.schedule('overdue-payments-daily', '5 0 * * *',
--     $$ select mark_overdue_payments(); $$);
