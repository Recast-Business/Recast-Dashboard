-- ════════════════════════════════════════════════════════════════════
-- DESTRUCTIVE — Reset all financial transaction data to zero
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️  This wipes EVERY row in the financial transaction tables —
--     not just [SEED]-tagged rows. Use this when you want the
--     Overview KPIs and Cash Flow chart to read $0 across the board
--     regardless of where the existing data came from (earlier dev
--     tests, prior migrations, manual entries).
--
-- WHAT GETS WIPED
-- ───────────────
--   • payment_receipts          (drives Inflow/Outflow KPIs + chart)
--   • vendor_payments           (Top Vendor + overdue rollup)
--   • tele_period_performance   (Top Talent + overdue rollup)
--   • of_period_performance     (Top Talent + overdue rollup)
--   • house_rent_payments       (overdue rollup)
--   • house_utility_payments    (overdue rollup)
--   • campaign_payments         (overdue rollup)
--   • talent_invoices           (M-6 — separate ledger)
--   • vendor_invoices           (M-4 — ad-hoc bills)
--   • payment_allocations       (M-7 — receipt allocation links)
--
-- WHAT STAYS
-- ──────────
--   • creators / vendors / house_residents / house_utilities
--   • of_deals / rent_groups
--   • brands / campaigns / campaign_creators
--   • briefs
--   • profiles / auth tables
--
-- After running this:
--   • Inflow / Outflow / Net / Outstanding overdue → $0
--   • Cash flow chart → empty
--   • Most overdue / Top talent / Top vendor lists → empty states
--   • Sidebar count badges (Roster / Leads / Potential) → unchanged
--     because they're driven by creators table, not payment data
--
-- Run in Supabase Studio → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- payment_allocations cascades from payment_receipts; clear it first
-- in case the FK is defined as ON DELETE RESTRICT somewhere.
DELETE FROM payment_allocations;

-- payment_receipts — drives the 4 KPI tiles + cash flow chart.
DELETE FROM payment_receipts;

-- 6 period-payment tables — drive overdue rollup + Top Vendor + Top Talent.
DELETE FROM vendor_payments;
DELETE FROM tele_period_performance;
DELETE FROM of_period_performance;
DELETE FROM house_rent_payments;
DELETE FROM house_utility_payments;
DELETE FROM campaign_payments;

-- M-phase invoice ledgers — kept symmetric with the period tables
-- so any cross-references stay clean.
DELETE FROM talent_invoices;
DELETE FROM vendor_invoices;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Verify (optional). Every count should be 0.
--
--   SELECT 'payment_receipts'        AS tbl, COUNT(*) FROM payment_receipts
--   UNION ALL SELECT 'payment_allocations',     COUNT(*) FROM payment_allocations
--   UNION ALL SELECT 'vendor_payments',         COUNT(*) FROM vendor_payments
--   UNION ALL SELECT 'tele_period_performance', COUNT(*) FROM tele_period_performance
--   UNION ALL SELECT 'of_period_performance',   COUNT(*) FROM of_period_performance
--   UNION ALL SELECT 'house_rent_payments',     COUNT(*) FROM house_rent_payments
--   UNION ALL SELECT 'house_utility_payments',  COUNT(*) FROM house_utility_payments
--   UNION ALL SELECT 'campaign_payments',       COUNT(*) FROM campaign_payments
--   UNION ALL SELECT 'talent_invoices',         COUNT(*) FROM talent_invoices
--   UNION ALL SELECT 'vendor_invoices',         COUNT(*) FROM vendor_invoices;
-- ════════════════════════════════════════════════════════════════════
