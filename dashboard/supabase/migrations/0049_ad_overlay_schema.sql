-- 0049_ad_overlay_schema.sql
-- Ad Overlay rework (Gus follow-up):
--
--   • Drop is_ad_overlay — campaigns.type = 'Ad Overlay' is now the
--     single source of truth (no redundant boolean to drift from
--     the type select).
--   • Move CPM + ad frequency onto the campaign (one rate card for
--     every attached creator).
--   • Per-month entry switches from views/displays/clicks (those
--     came from the generic CPM model) to CCV + airtime, the two
--     livestream-overlay inputs that actually vary per creator
--     per month. Stored on campaign_payments so they're recoverable
--     instead of thrown away after compute like the old metrics.

-- ── 1. Migrate existing data into the type column ────────────────
update campaigns
set    type = 'Ad Overlay'
where  is_ad_overlay = true
  and  (type is null or type <> 'Ad Overlay');

-- ── 2. Drop the redundant boolean ────────────────────────────────
alter table campaigns drop column if exists is_ad_overlay;

-- ── 3. Campaign-level rate card (Ad Overlay deals) ───────────────
alter table campaigns
  add column if not exists cpm_rate            numeric(10,2),
  add column if not exists ad_frequency_per_hr numeric(5,2);

comment on column campaigns.cpm_rate is
  'Ad Overlay deals: $ per 1,000 viewers per ad airing. Null for non-Ad-Overlay campaigns.';
comment on column campaigns.ad_frequency_per_hr is
  'Ad Overlay deals: ads played per streaming hour. Null for non-Ad-Overlay campaigns.';

-- ── 4. Per-period CCV + airtime (varies per creator-month) ───────
alter table campaign_payments
  add column if not exists ccv              int,
  add column if not exists airtime_minutes  int;

comment on column campaign_payments.ccv is
  'Ad Overlay deals: average concurrent viewer count during this month''s airtime. Null for other deal types.';
comment on column campaign_payments.airtime_minutes is
  'Ad Overlay deals: total streamed minutes in this month. Null for other deal types.';
