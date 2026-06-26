-- 0050_partner_campaign_read.sql
-- Restore partner read access on campaign_creators + campaign_payments.
--
-- Background:
--   • 0015 originally added `campaign_creators_partner_r` so partners
--     (Frazier) could see attached creators on a campaign.
--   • 0020 (finance overhaul) did `drop table campaign_creators cascade`
--     which silently nuked that policy. The recreate only added
--     admin + finance policies, with a comment claiming "partner
--     reads via _public view" — but the page reads from the base
--     table, so partners see campaigns expand to an empty roster.
--   • campaign_payments was new in 0020 and never had a partner
--     policy. Same blank-cell symptom on the per-month grid.
--
-- The campaigns table itself already has campaigns_partner_r so the
-- list view works; this migration just restores the joined-data
-- reads so expanded cards render properly for the partner role.

drop policy if exists campaign_creators_partner_r on campaign_creators;
create policy campaign_creators_partner_r on campaign_creators
  for select using (auth_role() = 'partner');

drop policy if exists campaign_payments_partner_r on campaign_payments;
create policy campaign_payments_partner_r on campaign_payments
  for select using (auth_role() = 'partner');
