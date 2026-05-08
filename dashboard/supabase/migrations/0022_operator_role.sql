-- Phase G — Add 'operator' role + view_campaign_financials flag.
--
-- WHY:
--   Harry needs to add campaigns + enter performance metrics but should NOT
--   see any $/% figures. Bruno needs the same scope but DOES see the financial
--   side of campaigns (so he can do campaign-level finance analysis without
--   touching the Finance hub itself).
--
--   Both share a single 'operator' role; they diverge on a per-profile flag
--   `view_campaign_financials`.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
--   After running, set the role + flag for Harry and Bruno via SQL Editor:
--     update profiles set role = 'operator', view_campaign_financials = false
--       where email = 'harry@recast.gg';
--     update profiles set role = 'operator', view_campaign_financials = true
--       where email = 'bruno@recast.gg';
--
--   (The exact email addresses depend on what you've created in Supabase Auth.)

begin;

-- 1. Extend user_role enum with 'operator'
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'operator'
      and enumtypid = (select oid from pg_type where typname = 'user_role')
  ) then
    alter type user_role add value 'operator';
  end if;
end $$;

-- 2. Add per-profile flag
alter table profiles
  add column if not exists view_campaign_financials boolean not null default false;

comment on column profiles.view_campaign_financials is
  'When true, an operator-role user sees $ and % figures on /campaigns. '
  'Has no effect on admin/finance/partner — they always see financials.';

-- 3. RLS — operators get the same SELECT/INSERT/UPDATE access as admin
--    on campaign tables, but NO access to vendor / banking / vault tables.
--
-- Policies are written defensively: each one uses a where-clause that checks
-- the caller's role from profiles. Existing admin/finance/partner policies
-- are untouched — these are new ones for operator.

-- Campaigns
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

-- Campaign creators
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

-- Campaign payments
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

-- Roster / Leads / Briefs / Activity / Scout — operator gets the same level
-- of access as partner (read most things). Roster is editable since they
-- need to add creators inline from the campaign attach flow.

drop policy if exists "operator: full creators" on creators;
create policy "operator: full creators" on creators
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'operator')
  );

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

-- Activity is hidden for operator at the route level on the frontend, but
-- we don't add a policy here that grants read — the absence of a policy
-- means RLS denies access by default.

-- Finance / vendors / banking / vault — explicitly blocked for operator.
-- We don't need new policies here either; the existing policies grant
-- access only to admin + finance, so operator falls through to "no access".

commit;

-- Verify after running:
--   select email, role, view_campaign_financials from profiles
--   where role = 'operator';
