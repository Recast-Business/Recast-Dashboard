-- rls_smoke_test.sql
-- Run this in the Supabase Studio SQL editor AFTER EVERY MIGRATION.
--
-- Why it exists: migration 0020 did `drop table campaign_creators
-- cascade`, which silently wiped the partner read policy added in
-- 0015. Nobody noticed for weeks — partners just saw empty campaign
-- cards. This script makes that class of regression loud.
--
-- What it does: for each role that has at least one real user, it
-- impersonates that user (same mechanism PostgREST uses — the
-- `request.jwt.claims` GUC + the `authenticated` DB role) and counts
-- the rows visible on the core tables, comparing against the true
-- count. Hard invariants raise an exception listing every failure;
-- everything else prints as a report for eyeballing.
--
-- Entirely read-only. Safe to run any time. Roles/claims reset when
-- the transaction ends.
--
-- HARD INVARIANTS CHECKED
--   partner    → sees ALL campaigns / campaign_creators /
--                campaign_payments / creators / briefs (the 0020
--                regression), exactly 1 profiles row (their own),
--                and ZERO banking_details rows
--   operator   → sees ALL campaigns / campaign_creators /
--                campaign_payments / creators, ZERO banking_details
--   accounting → sees ALL campaigns / vendors / talent_invoices /
--                payment_receipts
--   admin      → sees ALL profiles
--
-- "sees ALL" is vacuous when a table is empty — the report flags
-- those rows with "(empty)" so you know the check proved nothing.

do $$
declare
  v_tables text[] := array[
    'campaigns', 'campaign_creators', 'campaign_payments', 'creators',
    'briefs', 'vendors', 'vendor_invoices', 'talent_invoices',
    'payment_receipts', 'banking_details', 'profiles'
  ];
  v_roles text[] := array['admin', 'accounting', 'operator', 'partner'];
  v_baseline jsonb := '{}';   -- table -> true row count (as postgres)
  v_results  jsonb := '{}';   -- role  -> {table -> visible count}
  v_failures text[] := '{}';
  v_report   text[] := '{}';
  r text; t text;
  v_uid uuid;
  v_count bigint;
  v_role_counts jsonb;
  v_expect text;
  -- role -> table -> 'all' | 'zero' | 'one'
  v_matrix jsonb := '{
    "partner":    {"campaigns":"all", "campaign_creators":"all", "campaign_payments":"all",
                   "creators":"all", "briefs":"all", "banking_details":"zero", "profiles":"one"},
    "operator":   {"campaigns":"all", "campaign_creators":"all", "campaign_payments":"all",
                   "creators":"all", "banking_details":"zero", "profiles":"one"},
    "accounting": {"campaigns":"all", "vendors":"all", "talent_invoices":"all",
                   "payment_receipts":"all", "profiles":"one"},
    "admin":      {"profiles":"all"}
  }';
begin
  -- 1. Baseline counts with RLS bypassed (we are postgres here).
  foreach t in array v_tables loop
    execute format('select count(*) from public.%I', t) into v_count;
    v_baseline := v_baseline || jsonb_build_object(t, v_count);
  end loop;

  -- 2. Drop to the `authenticated` role — the role PostgREST uses for
  --    every signed-in request. RLS now applies to us.
  execute 'set local role authenticated';

  foreach r in array v_roles loop
    select id into v_uid from public.profiles where role::text = r limit 1;
    if v_uid is null then
      v_report := v_report || format('%-11s SKIPPED — no user with this role exists', r);
      continue;
    end if;

    -- Impersonate: auth.uid() reads the `sub` claim from this GUC.
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text,
      true
    );

    v_role_counts := '{}';
    foreach t in array v_tables loop
      execute format('select count(*) from public.%I', t) into v_count;
      v_role_counts := v_role_counts || jsonb_build_object(t, v_count);

      v_expect := v_matrix -> r ->> t;
      if v_expect is not null then
        if v_expect = 'all' and v_count <> (v_baseline ->> t)::bigint then
          v_failures := v_failures || format(
            '%s should see ALL %s rows but sees %s of %s',
            r, t, v_count, v_baseline ->> t);
        elsif v_expect = 'zero' and v_count <> 0 then
          v_failures := v_failures || format(
            '%s should see ZERO %s rows but sees %s — direct table access is open!',
            r, t, v_count);
        elsif v_expect = 'one' and v_count <> 1 then
          v_failures := v_failures || format(
            '%s should see exactly 1 profiles row (their own) but sees %s',
            r, v_count);
        end if;
      end if;

      v_report := v_report || format(
        '%-11s %-20s %5s / %-5s %s%s',
        r, t, v_count, v_baseline ->> t,
        case
          when v_expect is null then ''
          when v_expect = 'all'  and v_count = (v_baseline ->> t)::bigint then 'OK (all)'
          when v_expect = 'zero' and v_count = 0 then 'OK (blocked)'
          when v_expect = 'one'  and v_count = 1 then 'OK (self only)'
          else '*** FAIL ***'
        end,
        case when (v_baseline ->> t)::bigint = 0 then ' (empty — vacuous)' else '' end
      );
    end loop;
  end loop;

  -- 3. Print the full matrix, then verdict.
  raise notice '─── RLS smoke test ─────────────────────────────────────';
  raise notice 'role        table                visible/true  verdict';
  foreach t in array v_report loop
    raise notice '%', t;
  end loop;

  if array_length(v_failures, 1) > 0 then
    raise exception E'RLS SMOKE TEST FAILED:\n  - %',
      array_to_string(v_failures, E'\n  - ');
  end if;
  raise notice '─── RLS SMOKE TEST PASSED ──────────────────────────────';
end $$;
