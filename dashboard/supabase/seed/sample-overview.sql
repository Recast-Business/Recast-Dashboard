-- ════════════════════════════════════════════════════════════════════
-- Phase L (C1.2b) — Sample data for the Overview page
-- ════════════════════════════════════════════════════════════════════
--
-- Run this in Supabase Studio's SQL Editor (logged in as service_role
-- or via the dashboard, which bypasses RLS). It will populate just
-- enough data for the Overview screen to render its populated states:
--
--   • Roster / Leads / Potential count badges show real numbers
--   • The red overdue alert banner fires (6 items across 4 sections)
--   • Cash flow chart fills out for 2026 + 2025 (so YoY % renders)
--   • Most overdue / Top talent / Top vendor lists populate with avatars
--
-- EVERY row inserted here is tagged with `notes = '[SEED]'` AND uses a
-- deterministic UUID prefix:
--
--     creators       00000001-0001-0001-0001-...
--     vendors        00000002-0002-0002-0002-...
--     residents      00000003-0003-0003-0003-...
--     utilities      00000004-0004-0004-0004-...
--     of_deals       00000005-0005-0005-0005-...
--     rent_groups    00000006-0006-0006-0006-...
--
-- Run `sample-overview-cleanup.sql` to remove every seeded row in one
-- shot. Real production data is untouched.
--
-- The script is idempotent — running it twice is a no-op.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 0. Pre-clean any prior seed (so this script is safely re-runnable)
-- ──────────────────────────────────────────────────────────────────
DELETE FROM payment_receipts          WHERE notes = '[SEED]';
DELETE FROM vendor_payments           WHERE notes = '[SEED]';
DELETE FROM tele_period_performance   WHERE notes = '[SEED]';
DELETE FROM of_period_performance     WHERE notes = '[SEED]';
DELETE FROM house_rent_payments       WHERE notes = '[SEED]';
DELETE FROM house_utility_payments    WHERE notes = '[SEED]';
DELETE FROM of_deals                  WHERE notes = '[SEED]';
DELETE FROM house_utilities           WHERE notes = '[SEED]';
DELETE FROM house_residents           WHERE notes = '[SEED]';
DELETE FROM rent_groups               WHERE notes = '[SEED]';
DELETE FROM vendors                   WHERE notes = '[SEED]';
DELETE FROM creators                  WHERE notes = '[SEED]';

-- ──────────────────────────────────────────────────────────────────
-- 1. CREATORS (14 signed → Roster badge, 6 unsigned → Leads, 4 starred → Potential)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO creators (id, name, twitch_handle, country, tier, status, signed, starred, notes) VALUES
  ('00000001-0001-0001-0001-000000000001', 'Charlotte Parkes', NULL,           'US', 'A', 'active', true,  true,  '[SEED]'),
  ('00000001-0001-0001-0001-000000000002', 'BaldyBronson',     'baldybronson', 'US', 'A', 'active', true,  true,  '[SEED]'),
  ('00000001-0001-0001-0001-000000000003', 'Bruno Hagen',      'brunohagen',   'DE', 'B', 'active', true,  true,  '[SEED]'),
  ('00000001-0001-0001-0001-000000000004', 'Frazier Lin',      NULL,           'CA', 'A', 'active', true,  true,  '[SEED]'),
  ('00000001-0001-0001-0001-000000000005', 'LosPollosTV',      'lospollostv',  'MX', 'B', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000006', 'Saif Ahmed',       'saifahmed',    'UK', 'B', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000007', 'Mira Chen',        NULL,           'US', 'B', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000008', 'Dani Voss',        NULL,           'AU', 'A', 'active', true,  false, '[SEED]'),
  -- 6 more signed creators to push Roster badge to 14
  ('00000001-0001-0001-0001-000000000009', 'Kai Mason',        'kaimason',     'US', 'B', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-00000000000a', 'Ren Sato',         'rensato',      'JP', 'B', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-00000000000b', 'Theo Reyes',       'theoreyes',    'PH', 'C', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-00000000000c', 'Nora Vance',       NULL,           'CA', 'B', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-00000000000d', 'Iris Holden',      NULL,           'US', 'A', 'active', true,  false, '[SEED]'),
  ('00000001-0001-0001-0001-00000000000e', 'Wren Bishop',      'wrenbishop',   'UK', 'B', 'active', true,  false, '[SEED]'),
  -- 6 unsigned (drives Leads count)
  ('00000001-0001-0001-0001-00000000000f', 'Quinn Ashcroft',   'quinnash',     'US', 'C', 'active', false, false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000010', 'Pia Larsen',       'pialarsen',    'NO', 'C', 'active', false, false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000011', 'Otto Kraus',       'ottokraus',    'DE', 'C', 'active', false, false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000012', 'Sage Mendez',      NULL,           'ES', 'C', 'active', false, false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000013', 'Cleo Park',        'cleopark',     'KR', 'C', 'active', false, false, '[SEED]'),
  ('00000001-0001-0001-0001-000000000014', 'Jett Rowe',        'jettrowe',     'US', 'C', 'active', false, false, '[SEED]')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 2. VENDORS (9 vendors total — 5 with May activity show in Top Vendor)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO vendors (id, name, kind, division, payment_method, active, notes) VALUES
  ('00000002-0002-0002-0002-000000000001', 'Adobe Creative Cloud', 'vendor', 'efuse',    'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000002', 'Restream',             'vendor', 'efuse',    'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000003', 'Cloudflare',           'vendor', NULL,       'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000004', 'Frame.io',             'vendor', 'efuse',    'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000005', 'Linear',               'vendor', NULL,       'auto_pay',  true, '[SEED]'),
  -- 4 lower-spend vendors so the "5 of 9" subtitle reads true
  ('00000002-0002-0002-0002-000000000006', 'Notion',               'vendor', NULL,       'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000007', 'Vercel',               'vendor', NULL,       'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000008', '1Password',            'vendor', NULL,       'auto_pay',  true, '[SEED]'),
  ('00000002-0002-0002-0002-000000000009', 'Loom',                 'vendor', NULL,       'auto_pay',  true, '[SEED]')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 3. HOUSE — 1 rent_group (M-2 schema) + 1 resident (Dan Mosley)
--           + 1 utility ("Power")
-- M-2 (migration 0032) split rent into a rent_groups table — the
-- rent_payments row carries rent_group_id (NOT NULL), not resident_id.
-- ──────────────────────────────────────────────────────────────────
INSERT INTO rent_groups (id, label, monthly_rent, active, notes) VALUES
  ('00000006-0006-0006-0006-000000000001', 'Dan Mosley', 800, true, '[SEED]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO house_residents (id, name, bedroom, monthly_rent, rent_group_id, active, notes) VALUES
  ('00000003-0003-0003-0003-000000000001', 'Dan Mosley',  'Bedroom 3', 800,
   '00000006-0006-0006-0006-000000000001', true, '[SEED]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO house_utilities (id, utility_name, active, notes) VALUES
  ('00000004-0004-0004-0004-000000000001', 'Power',    true, '[SEED]')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 4. OF_DEALS — pages for OF creators (Charlotte, BaldyBronson,
--    Frazier Lin, Dani Voss). One page each is enough.
-- ──────────────────────────────────────────────────────────────────
INSERT INTO of_deals (id, creator_id, page_name, recast_pct, basis, active, notes) VALUES
  ('00000005-0005-0005-0005-000000000001', '00000001-0001-0001-0001-000000000001', 'Charlotte Free', 25, 'net', true, '[SEED]'),
  ('00000005-0005-0005-0005-000000000002', '00000001-0001-0001-0001-000000000002', 'Baldy Main',     30, 'net', true, '[SEED]'),
  ('00000005-0005-0005-0005-000000000004', '00000001-0001-0001-0001-000000000004', 'Frazier Main',   25, 'net', true, '[SEED]'),
  ('00000005-0005-0005-0005-000000000008', '00000001-0001-0001-0001-000000000008', 'Dani Main',      25, 'net', true, '[SEED]')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 5. PAYMENT RECEIPTS — drives the Cash Flow chart.
--    7 months of inflow + outflow for 2026 + same shape for 2025
--    at slightly lower amounts (so the YoY pill reads positive).
--
--    Inflow sources: telegram / onlyfans / campaign / house_rent
--    Outflow sources: vendor / house_utility
--
--    For brevity we lump receipts onto the first vendor + first
--    creator + first deal — the chart only buckets by source.
-- ──────────────────────────────────────────────────────────────────

-- 2026 inflow (OnlyFans channel — biggest), 7 months
INSERT INTO payment_receipts (source, of_deal_id, received_at, amount, method, notes) VALUES
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-01-12', 65000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-02-10', 70000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-03-12', 78000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-04-11', 92000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-05-15', 88000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-06-13', 104000,'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2026-07-10', 118000,'bank_ach', '[SEED]');

-- 2026 outflow (Adobe vendor stand-in), 7 months
INSERT INTO payment_receipts (source, vendor_id, received_at, amount, method, notes) VALUES
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-01-15', 38000, 'auto_pay', '[SEED]'),
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-02-15', 42000, 'auto_pay', '[SEED]'),
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-03-15', 46000, 'auto_pay', '[SEED]'),
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-04-15', 48000, 'auto_pay', '[SEED]'),
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-05-15', 52000, 'auto_pay', '[SEED]'),
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-06-15', 49000, 'auto_pay', '[SEED]'),
  ('vendor',   '00000002-0002-0002-0002-000000000001', '2026-07-15', 26118.42,'auto_pay', '[SEED]');

-- 2025 — same shape, ~80% scale (so YoY ~ +18%)
INSERT INTO payment_receipts (source, of_deal_id, received_at, amount, method, notes) VALUES
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-01-12', 54000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-02-12', 60000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-03-12', 68000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-04-12', 72000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-05-12', 77000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-06-12', 84000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-07-12', 92000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-08-12', 96000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-09-12', 102000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-10-12', 98000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-11-12', 108000, 'bank_ach', '[SEED]'),
  ('onlyfans', '00000005-0005-0005-0005-000000000001', '2025-12-12', 116000, 'bank_ach', '[SEED]');

INSERT INTO payment_receipts (source, vendor_id, received_at, amount, method, notes) VALUES
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-01-15', 34000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-02-15', 38000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-03-15', 42000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-04-15', 44000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-05-15', 46000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-06-15', 48000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-07-15', 50000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-08-15', 52000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-09-15', 54000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-10-15', 52000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-11-15', 56000, 'auto_pay', '[SEED]'),
  ('vendor', '00000002-0002-0002-0002-000000000001', '2025-12-15', 58000, 'auto_pay', '[SEED]');

-- ──────────────────────────────────────────────────────────────────
-- 6. CURRENT-MONTH (May 2026) talent + vendor activity
--    Drives the Top Talent / Top Vendor lists.
--    NOTE: useFinanceOverview keys top-talent/vendor off the CURRENT
--    server month — adjust the period_year/month here if you're
--    seeding and the live page reads a different month.
-- ──────────────────────────────────────────────────────────────────

-- Top Talent (May 2026)
-- Charlotte Parkes — both OF and Telegram (combined gross: $28,400)
INSERT INTO of_period_performance
  (of_deal_id, period_year, period_month, gross_revenue, net_revenue, recast_commission, status, amount_paid, notes)
VALUES
  ('00000005-0005-0005-0005-000000000001', 2026, 5, 18000, 12000, 3000,  'paid', 3000, '[SEED]'),
  ('00000005-0005-0005-0005-000000000002', 2026, 5, 21800, 15000, 4500,  'paid', 4500, '[SEED]'),  -- BaldyBronson
  ('00000005-0005-0005-0005-000000000004', 2026, 5,  4200,  3000,  750,  'paid',  750, '[SEED]'),  -- Frazier Lin (OF portion)
  ('00000005-0005-0005-0005-000000000008', 2026, 5,   480,   320,   80,  'paid',   80, '[SEED]');  -- Dani Voss (small)

INSERT INTO tele_period_performance
  (creator_id, period_year, period_month, gross_revenue, net_revenue, recast_commission, qualified_for_mg, status, amount_paid, notes)
VALUES
  ('00000001-0001-0001-0001-000000000001', 2026, 5, 10400,  5200, 1300, true, 'paid',  1300, '[SEED]'),  -- Charlotte Tele
  ('00000001-0001-0001-0001-000000000003', 2026, 5, 13100,  6550, 1640, true, 'paid',  1640, '[SEED]'),  -- Bruno Hagen
  ('00000001-0001-0001-0001-000000000004', 2026, 5,  7000,  3500,  870, true, 'paid',   870, '[SEED]'),  -- Frazier Lin (Tele)
  ('00000001-0001-0001-0001-000000000005', 2026, 5,  8600,  4300, 1080, true, 'paid',  1080, '[SEED]');  -- LosPollosTV

-- Top Vendor (May 2026)
INSERT INTO vendor_payments
  (vendor_id, period_year, period_month, status, amount, paid_at, amount_paid, notes)
VALUES
  ('00000002-0002-0002-0002-000000000001', 2026, 5, 'paid', 1008, '2026-05-03', 1008, '[SEED]'),  -- Adobe CC
  ('00000002-0002-0002-0002-000000000002', 2026, 5, 'paid',  948, '2026-05-04',  948, '[SEED]'),  -- Restream
  ('00000002-0002-0002-0002-000000000003', 2026, 5, 'paid',  576, '2026-05-04',  576, '[SEED]'),  -- Cloudflare
  ('00000002-0002-0002-0002-000000000004', 2026, 5, 'paid',  300, '2026-05-04',  300, '[SEED]'),  -- Frame.io
  ('00000002-0002-0002-0002-000000000005', 2026, 5, 'paid',  200, '2026-05-04',  200, '[SEED]'); -- Linear

-- ──────────────────────────────────────────────────────────────────
-- 7. OVERDUE ITEMS (drives the red banner + Most Overdue list)
--    6 items across vendor / OnlyFans / Telegram / talent_invoice
--    (modeled as vendor with kind=talent_we_pay) / rent / utility.
--
--    Days-late is computed by useFinanceOverview from period_year /
--    period_month relative to NOW. We seed older months so the live
--    page renders a non-zero days-late number regardless of
--    today's date.
-- ──────────────────────────────────────────────────────────────────

-- Pending Adobe vendor bill (12d late)
INSERT INTO vendor_payments
  (vendor_id, period_year, period_month, status, amount, amount_paid, notes)
VALUES
  ('00000002-0002-0002-0002-000000000001', 2026, 4, 'overdue', 84, 0, '[SEED]');  -- Adobe Creative Cloud overdue

-- OnlyFans Frazier Lin Jul ($5,900 8d late)
INSERT INTO of_period_performance
  (of_deal_id, period_year, period_month, gross_revenue, net_revenue, recast_commission, status, amount_paid, notes)
VALUES
  ('00000005-0005-0005-0005-000000000004', 2026, 6, 23600, 17700, 5900, 'overdue', 0, '[SEED]');

-- Telegram Mira Chen Jul ($3,100 5d late)
INSERT INTO tele_period_performance
  (creator_id, period_year, period_month, gross_revenue, net_revenue, recast_commission, qualified_for_mg, status, amount_paid, notes)
VALUES
  ('00000001-0001-0001-0001-000000000007', 2026, 6, 12400, 6200, 3100, true, 'overdue', 0, '[SEED]');

-- Saif Ahmed talent invoice — model as a vendor (kind=talent_we_pay)
-- and an overdue vendor_payment so it appears in vendorsOverdue rollup.
-- Insert vendor first, then the overdue payment.
INSERT INTO vendors (id, name, kind, division, payment_method, active, notes) VALUES
  ('00000002-0002-0002-0002-00000000000a', 'Saif Ahmed (talent invoice)', 'talent_we_pay', NULL, 'paypal', true, '[SEED]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendor_payments
  (vendor_id, period_year, period_month, status, amount, amount_paid, notes)
VALUES
  ('00000002-0002-0002-0002-00000000000a', 2026, 4, 'overdue', 8800, 0, '[SEED]');

-- House rent — Dan Mosley overdue Jul
-- Per M-2 schema: rent_group_id is required; resident_id stays for audit.
INSERT INTO house_rent_payments
  (rent_group_id, resident_id, period_year, period_month, amount, status, amount_paid, notes)
VALUES
  ('00000006-0006-0006-0006-000000000001',
   '00000003-0003-0003-0003-000000000001',
   2026, 6, 800, 'overdue', 0, '[SEED]');

-- House utility — Power overdue (most recent)
INSERT INTO house_utility_payments
  (utility_id, period_year, period_month, amount, status, amount_paid, notes)
VALUES
  ('00000004-0004-0004-0004-000000000001', 2026, 6, 142, 'overdue', 0, '[SEED]');

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Done. Refresh the Overview page and you should see:
--   • Sidebar Roster badge: 14, Leads badge: 6, Potential badge: 4
--   • Red overdue banner: "6 payments past deadline"
--   • Cash flow chart: 7 months of bars + dashed prior-year lines
--     when "Compare 2025" is on, +18.2% YoY pill
--   • Most overdue list: 5 items with rank 01-05 + late badges
--   • Top talent list: Charlotte / BaldyBronson / Bruno / Frazier / LosPollos
--     with avatars + 3px progress bars
--   • Top vendor list: Adobe / Restream / Cloudflare / Frame.io / Linear
--     with steel avatars + steel progress bars
-- ════════════════════════════════════════════════════════════════════
