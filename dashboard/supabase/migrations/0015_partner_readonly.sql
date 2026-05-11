-- 0015_partner_readonly.sql
-- Partner role (Frazier) becomes a full read-only viewer:
--   * Can SELECT every table that exposes operational data.
--   * CANNOT insert/update/delete anything.
-- Previously partners had full read+write on briefs, creators, and only
-- read via campaign_creators_public. Tighten and widen as needed.

-- campaign_creators — partners can now read full financial data (read-only).
drop policy if exists campaign_creators_partner_r on campaign_creators;
create policy campaign_creators_partner_r on campaign_creators
  for select using (auth_role() = 'partner');

-- payments — partners can read payment history.
drop policy if exists payments_partner_r on payments;
create policy payments_partner_r on payments
  for select using (auth_role() = 'partner');

-- activity_log — widen read to include partner.
drop policy if exists activity_log_read on activity_log;
create policy activity_log_read on activity_log
  for select using (auth_role() in ('admin', 'finance', 'partner'));

-- briefs — previously 'for all'. Now read-only.
drop policy if exists briefs_partner on briefs;
drop policy if exists briefs_partner_r on briefs;
create policy briefs_partner_r on briefs
  for select using (auth_role() = 'partner');

-- creators — previously 'for all'. Now read-only.
drop policy if exists creators_partner on creators;
drop policy if exists creators_partner_r on creators;
create policy creators_partner_r on creators
  for select using (auth_role() = 'partner');

-- brands and campaigns are already SELECT-only for partner (no change needed).
