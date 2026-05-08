-- Phase G — STEP 2 of 2.
--
-- Run this AFTER 0022_operator_role.sql has committed (it adds the enum value
-- 'operator' to user_role). Postgres won't let you reference a freshly-added
-- enum value in the same transaction it was created in, so they're split.
--
-- WHAT THIS DOES:
--   • Adds profiles.view_campaign_financials (boolean, default false)
--   • Adds RLS policies that grant the 'operator' role:
--       - read + write on campaigns / campaign_creators / campaign_payments
--       - read + write on creators (Roster + Leads share this table)
--       - read + write on briefs
--   • Operators have NO access to vendors / banking_details / vault_access_log /
--     vendor_payments / tele_* / of_* / house_* — the existing admin+finance
--     policies already cover those, and operator simply isn't on the allow-list.
--
-- AFTER THIS RUNS, set Harry + Bruno's roles via SQL Editor:
--   update profiles set role = 'operator', view_campaign_financials = false
--     where email = 'harry@recast.gg';
--   update profiles set role = 'operator', view_campaign_financials = true
--     where email = 'bruno@recast.gg';

begin;

-- 1. Per-profile flag
alter table profiles
  add column if not exists view_campaign_financials boolean not null default false;

comment on column profiles.view_campaign_financials is
  'When true, an operator-role user sees $ and % figures on /campaigns. '
  'Has no effect on admin/finance/partner — they always see financials.';

-- 2. RLS — operators on campaigns
drop policy if exists "operator: read campaigns" on campaigns;
create policy "operator: read campaigns" on campaigns
  for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

drop policy if exists "operator: write campaigns" on campaigns;
create policy "operator: write campaigns" on campaigns
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

-- 3. RLS — operators on campaign_creators
drop policy if exists "operator: read campaign_creators" on campaign_creators;
create policy "operator: read campaign_creators" on campaign_creators
  for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

drop policy if exists "operator: write campaign_creators" on campaign_creators;
create policy "operator: write campaign_creators" on campaign_creators
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

-- 4. RLS — operators on campaign_payments
drop policy if exists "operator: read campaign_payments" on campaign_payments;
create policy "operator: read campaign_payments" on campaign_payments
  for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

drop policy if exists "operator: write campaign_payments" on campaign_payments;
create policy "operator: write campaign_payments" on campaign_payments
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

-- 5. RLS — operators on creators (Roster + Leads share this table)
drop policy if exists "operator: full creators" on creators;
create policy "operator: full creators" on creators
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

-- 6. RLS — operators on briefs
drop policy if exists "operator: read briefs" on briefs;
create policy "operator: read briefs" on briefs
  for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

drop policy if exists "operator: write briefs" on briefs;
create policy "operator: write briefs" on briefs
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

commit;

-- Verify (run separately):
--   select email, role, view_campaign_financials from profiles
--   where role = 'operator';
