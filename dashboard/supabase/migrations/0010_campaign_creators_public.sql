-- 0010_campaign_creators_public.sql
-- Partner-safe projection of campaign_creators.
-- Omits deal_structure, manual_inputs, cached_earnings, cached_commission
-- so partners (Frazier) can see who is attached to a campaign without seeing
-- any financial detail. Runs with security_invoker=off so it bypasses the
-- base table's RLS (which denies partners direct access).

drop view if exists campaign_creators_public;

create view campaign_creators_public
with (security_invoker = off) as
  select
    id,
    campaign_id,
    creator_id,
    payment_status,
    payment_due_date,
    last_calculated_at
  from campaign_creators;

grant select on campaign_creators_public to authenticated;
