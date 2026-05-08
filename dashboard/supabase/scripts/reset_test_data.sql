-- Wipes all transactional data so you start with a clean dashboard.
--
-- KEEPS:
--   • Schema, RLS policies, triggers, encryption key in vault.secrets
--   • All `creators` (Roster + Leads — your real signed roster stays)
--   • The 5 originally-seeded house_residents
--     (Frazier, Charlotte, Harriet & Keenan, Teeqo, Nikan)
--   • The 8 originally-seeded house_utilities
--     (ADT, COX, Las Vegas Water, NV Energy, Southwest Gas, Trash, Cleaning, House Services)
--   • All `profiles` and Supabase Auth users
--
-- WIPES:
--   • Vendors + their banking, payment grids, audit log
--   • Telegram and OnlyFans deals + monthly performance
--   • House utility payments + rent payments (for every year)
--   • Any extra residents/utilities you added on top of the seed
--   • Any campaigns you might have created
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- Safe to run multiple times — every statement is idempotent.

begin;

-- 1. Audit log + encrypted banking
delete from vault_access_log;
delete from banking_details;

-- 2. Payment grids + performance
delete from vendor_payments;
delete from tele_period_performance;
delete from of_period_performance;
delete from house_utility_payments;
delete from house_rent_payments;
delete from campaign_payments;

-- 3. Deals + campaigns
delete from tele_deals;
delete from of_deals;
delete from campaign_creators;
delete from campaigns;

-- 4. Vendors (cascades have already cleared dependents above)
delete from vendors;

-- 5. House — keep ONLY the originally-seeded residents / utilities
delete from house_residents
where lower(name) not in (
  'frazier',
  'charlotte',
  'harriet & keenan',
  'teeqo',
  'nikan'
);

delete from house_utilities
where lower(utility_name) not in (
  'adt security system',
  'cox',
  'las vegas valley water district',
  'nv energy',
  'southwest gas',
  'trash & sewage',
  'cleaning fees',
  'house services'
);

commit;

-- Verify (run separately to inspect results):
--   select 'vendors' as t, count(*) from vendors
--   union all select 'banking_details', count(*) from banking_details
--   union all select 'tele_deals', count(*) from tele_deals
--   union all select 'of_deals', count(*) from of_deals
--   union all select 'house_residents', count(*) from house_residents
--   union all select 'house_utilities', count(*) from house_utilities
--   union all select 'house_utility_payments', count(*) from house_utility_payments
--   union all select 'house_rent_payments', count(*) from house_rent_payments
--   union all select 'vendor_payments', count(*) from vendor_payments
--   union all select 'tele_period_performance', count(*) from tele_period_performance
--   union all select 'of_period_performance', count(*) from of_period_performance;
