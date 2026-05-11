-- 0034_round3_profile_expansion.sql
-- Round 3 (Gustavo): Talent + Vendor profile expansion.
--
-- WHY
-- ───
-- Gustavo wants the Talent Ledger and Vendor Ledger to act as full
-- profiles that feed the rest of the platform (Finance, Calculator,
-- Invoices, Payment tracking, Overview). Most of the contact-info
-- columns landed in 0026 (creator) and 0031 (vendor). This migration
-- adds the last three:
--
--   • creators.agreement_links  — clickable platform agreement URLs
--   • creators.commission_tiers — per-platform tiered % rules
--   • vendors.service_provided  — short description of what the vendor does
--
-- Additive only. No data loss. No dropped columns. Existing rows get
-- the default empty values; UI gracefully handles empty state.

-- ============================================================
-- 1. creators.agreement_links
-- ============================================================
-- Shape: { platform_slug: url, ... }
-- e.g. { "onlyfans": "https://drive.google.com/...",
--        "telegram": "https://drive.google.com/...",
--        "overlay":  "https://drive.google.com/..." }
-- Keys are open-ended so we can add new platforms without migrations.
-- The Talent profile UI renders one row per platform with a clickable
-- "Open" button when the URL is set.

alter table creators
  add column if not exists agreement_links jsonb not null default '{}'::jsonb;

comment on column creators.agreement_links is
  'Round 3: map of platform_slug → agreement URL (Google Drive, Dropbox, etc.). '
  'Keys: onlyfans / telegram / overlay / deal / other. The Talent profile dialog '
  'renders one row per key with a clickable Open button.';

-- ============================================================
-- 2. creators.commission_tiers
-- ============================================================
-- Shape (per-platform, ascending threshold, last tier has threshold:null):
--   {
--     "onlyfans": [
--       { "threshold": 100000, "pct": 25 },   -- first $100k → 25%
--       { "threshold": null,   "pct": 20 }    -- everything above → 20%
--     ],
--     "telegram": [
--       { "threshold": null, "pct": 30 }      -- flat 30%
--     ]
--   }
-- Progressive (each tier applies only to its slice — like income tax
-- brackets). Single-rate creators just have one tier with
-- threshold:null. The Calculator looks up the talent's tier table by
-- platform and applies the math automatically when computing
-- Recast's commission.
--
-- This sits ALONGSIDE the existing commission_pct_by_platform jsonb
-- from 0026 (which holds a flat { platform: pct } shape). The app
-- prefers commission_tiers when present, falls back to
-- commission_pct_by_platform otherwise — backward-compat without
-- needing to migrate every existing row.

alter table creators
  add column if not exists commission_tiers jsonb not null default '{}'::jsonb;

comment on column creators.commission_tiers is
  'Round 3: per-platform tiered commission rules. Shape: '
  '{ platform_slug: [{ threshold: number|null, pct: number }, ...] }. '
  'Tiers ascend by threshold; the last tier should have threshold:null. '
  'Progressive — each tier applies to its slice only. Calculator prefers '
  'this over commission_pct_by_platform when populated.';

-- ============================================================
-- 3. vendors.service_provided
-- ============================================================
-- Short text description of what the vendor does for Recast (e.g.
-- "Streaming infra", "Legal — talent agreements", "Design contractor").
-- Shown on the Vendor profile + detail page; helps Gustavo distinguish
-- vendors at a glance without reading the notes field.

alter table vendors
  add column if not exists service_provided text;

comment on column vendors.service_provided is
  'Round 3: short description of what this vendor does. Shown on the '
  'vendor row + detail page header. Not used in any calculation — '
  'pure metadata for human context.';

-- ============================================================
-- Done. No data backfill needed; defaults cover existing rows.
-- ============================================================
