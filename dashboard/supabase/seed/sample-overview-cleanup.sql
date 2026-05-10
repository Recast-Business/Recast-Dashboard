-- ════════════════════════════════════════════════════════════════════
-- Phase L (C1.2b) — Cleanup script for sample-overview.sql
-- ════════════════════════════════════════════════════════════════════
--
-- Run this in Supabase Studio's SQL Editor to remove every row that
-- `sample-overview.sql` inserted. Real production data is untouched
-- because the cleanup only matches rows where `notes = '[SEED]'`.
--
-- The order below is reverse-FK so we don't violate any foreign-key
-- constraints. Each statement reports affected rows so you can confirm
-- the right counts.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Receipts (FK to vendors / creators / of_deals / residents / utilities)
DELETE FROM payment_receipts WHERE notes = '[SEED]';

-- 2. Period-payment tables (FK to vendors / creators / of_deals / residents / utilities)
DELETE FROM vendor_payments        WHERE notes = '[SEED]';
DELETE FROM tele_period_performance WHERE notes = '[SEED]';
DELETE FROM of_period_performance   WHERE notes = '[SEED]';
DELETE FROM house_rent_payments    WHERE notes = '[SEED]';
DELETE FROM house_utility_payments WHERE notes = '[SEED]';

-- 3. of_deals (FK to creators)
DELETE FROM of_deals WHERE notes = '[SEED]';

-- 4. Entities (no FK in)
DELETE FROM house_utilities WHERE notes = '[SEED]';
DELETE FROM house_residents WHERE notes = '[SEED]';
DELETE FROM rent_groups     WHERE notes = '[SEED]';   -- M-2 schema
DELETE FROM vendors         WHERE notes = '[SEED]';
DELETE FROM creators        WHERE notes = '[SEED]';

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Verify the cleanup landed cleanly:
--
--   SELECT 'creators'                AS tbl, COUNT(*) FROM creators                WHERE notes = '[SEED]'
--   UNION ALL SELECT 'vendors',        COUNT(*) FROM vendors                WHERE notes = '[SEED]'
--   UNION ALL SELECT 'of_deals',       COUNT(*) FROM of_deals               WHERE notes = '[SEED]'
--   UNION ALL SELECT 'vendor_pay',     COUNT(*) FROM vendor_payments        WHERE notes = '[SEED]'
--   UNION ALL SELECT 'tele_pay',       COUNT(*) FROM tele_period_performance WHERE notes = '[SEED]'
--   UNION ALL SELECT 'of_pay',         COUNT(*) FROM of_period_performance   WHERE notes = '[SEED]'
--   UNION ALL SELECT 'house_rent',     COUNT(*) FROM house_rent_payments    WHERE notes = '[SEED]'
--   UNION ALL SELECT 'house_util_pay', COUNT(*) FROM house_utility_payments WHERE notes = '[SEED]'
--   UNION ALL SELECT 'house_residents',COUNT(*) FROM house_residents        WHERE notes = '[SEED]'
--   UNION ALL SELECT 'rent_groups',    COUNT(*) FROM rent_groups            WHERE notes = '[SEED]'
--   UNION ALL SELECT 'house_util',     COUNT(*) FROM house_utilities        WHERE notes = '[SEED]'
--   UNION ALL SELECT 'receipts',       COUNT(*) FROM payment_receipts       WHERE notes = '[SEED]';
--
-- Every count should be 0.
-- ════════════════════════════════════════════════════════════════════
