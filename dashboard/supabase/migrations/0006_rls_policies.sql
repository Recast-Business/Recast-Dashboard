-- 0006_rls_policies.sql
-- Helper + enable RLS + per-role policies.

create or replace function auth_role() returns user_role
language sql stable security definer
set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Every authenticated user can read their own profile.
alter table profiles enable row level security;

create policy profiles_self_read on profiles
  for select using (auth.uid() = id);
create policy profiles_admin_all on profiles
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- BRANDS
alter table brands enable row level security;
create policy brands_admin on brands
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy brands_partner_r on brands
  for select using (auth_role() = 'partner');
create policy brands_finance_rw on brands
  for all using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- CAMPAIGNS
alter table campaigns enable row level security;
create policy campaigns_admin on campaigns
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy campaigns_partner_r on campaigns
  for select using (auth_role() = 'partner');
create policy campaigns_finance_rw on campaigns
  for all using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- CREATORS — hidden from finance
alter table creators enable row level security;
create policy creators_admin on creators
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy creators_partner on creators
  for all using (auth_role() = 'partner') with check (auth_role() = 'partner');
-- finance cannot see creators directly.

-- CAMPAIGN_CREATORS — partner reads via view only; finance/admin get the table
alter table campaign_creators enable row level security;
create policy campaign_creators_admin on campaign_creators
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy campaign_creators_finance on campaign_creators
  for all using (auth_role() = 'finance') with check (auth_role() = 'finance');
-- no direct partner read; they go through campaign_creators_public view.

-- PAYMENTS — admin + finance only
alter table payments enable row level security;
create policy payments_admin on payments
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy payments_finance on payments
  for all using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- ACTIVITY_LOG — admin + finance read; nobody writes directly (triggers only)
alter table activity_log enable row level security;
create policy activity_log_read on activity_log
  for select using (auth_role() in ('admin', 'finance'));
-- No insert/update/delete policies → only SECURITY DEFINER triggers can write.

-- BRIEFS — admin + partner (hidden from finance)
alter table briefs enable row level security;
create policy briefs_admin on briefs
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy briefs_partner on briefs
  for all using (auth_role() = 'partner') with check (auth_role() = 'partner');
