-- 0016_finance_roster_read.sql
-- Finance (Gustavo) can read creators so the Roster page works and so
-- campaign creator joins resolve (a campaign may include a Lead via the
-- "Include Leads" toggle). UI-level gating still hides the Leads page from
-- finance — this policy is just the data layer.

drop policy if exists creators_finance_r on creators;
create policy creators_finance_r on creators
  for select using (auth_role() = 'finance');
