-- backup_snapshot.sql
-- Quick on-demand JSON export of every table that holds real Recast data.
--
-- HOW TO USE
-- ──────────
-- 1. Open Supabase Studio → SQL Editor → New query.
-- 2. Paste the entire query below. Hit Run.
-- 3. The result has a single row, single column called `snapshot`.
-- 4. Click the cell → "Copy as JSON" → paste into a local file like
--    `recast-backup-YYYY-MM-DD.json`. Stash somewhere safe (iCloud,
--    Dropbox, an external drive — anywhere off the Supabase project).
--
-- WHAT'S INCLUDED
-- ───────────────
-- Every business-data table:
--   • Creators + their full profiles (commission_pct_by_platform, socials, etc.)
--   • Tele/OF deals + monthly performance rows
--   • Vendors + monthly payments + ad-hoc invoices
--   • House (residents, utilities, rent, utility payments)
--   • Payment receipts + allocations (the K-3 ledger)
--   • Campaigns + campaign creators + campaign payments
--
-- INTENTIONALLY EXCLUDED (security)
-- ─────────────────────────────────
--   • banking_details — bank account numbers, card last4, etc.
--     If you need a banking backup, do that separately with explicit
--     intent — keeping it out of routine snapshots reduces accidental
--     leak surface.
--   • vault_access_log — append-only audit; rebuildable if lost.
--   • profiles / auth.users — Supabase auth manages its own backups.
--   • activity_log — high-volume, regenerable from current state.
--
-- RESTORING (if you ever need to)
-- ───────────────────────────────
-- This is a flat snapshot, not a true `pg_dump`. To rebuild:
--   1. Run the migrations (0001 → 0030) on a fresh project to recreate
--      schema, RLS, triggers.
--   2. Use a small script to upsert each top-level array back into its
--      table in dependency order (creators first, then deals/vendors,
--      then performance/payments, then receipts/allocations).
-- For a faster restore, use `pg_dump`/`psql` instead — see
-- the project README or follow the libpq/Homebrew path described in
-- the codebase docs.

select json_build_object(
  'taken_at', now(),

  -- Creators (full profile incl. commission tiers)
  'creators',
    (select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb) from creators c),

  -- Telegram
  'tele_deals',
    (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from tele_deals t),
  'tele_period_performance',
    (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from tele_period_performance p),

  -- OnlyFans
  'of_deals',
    (select coalesce(jsonb_agg(row_to_json(o)), '[]'::jsonb) from of_deals o),
  'of_period_performance',
    (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from of_period_performance p),

  -- Vendors + their monthly grid + ad-hoc invoices
  'vendors',
    (select coalesce(jsonb_agg(row_to_json(v)), '[]'::jsonb) from vendors v),
  'vendor_payments',
    (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from vendor_payments p),
  'vendor_invoices',
    (select coalesce(jsonb_agg(row_to_json(i)), '[]'::jsonb) from vendor_invoices i),

  -- Frazier's House
  'house_residents',
    (select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) from house_residents r),
  'house_utilities',
    (select coalesce(jsonb_agg(row_to_json(u)), '[]'::jsonb) from house_utilities u),
  'house_rent_payments',
    (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from house_rent_payments p),
  'house_utility_payments',
    (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from house_utility_payments p),

  -- Payment ledger (K-3)
  'payment_receipts',
    (select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) from payment_receipts r),
  'payment_allocations',
    (select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) from payment_allocations a),

  -- Campaigns (eFuse / Overlay)
  'campaigns',
    (select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb) from campaigns c),
  'campaign_creators',
    (select coalesce(jsonb_agg(row_to_json(cc)), '[]'::jsonb) from campaign_creators cc),
  'campaign_payments',
    (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from campaign_payments p),

  -- Briefs
  'briefs',
    (select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb) from briefs b)
) as snapshot;
