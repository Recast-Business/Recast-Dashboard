-- 0043_creator_per_page.sql
-- Round 5 Sweep 3a (Gustavo, T3): per-page commission + multi-agreement
-- table + NDA on creators.
--
-- This migration is ADDITIVE ONLY. No existing column dropped, no
-- existing data lost. Sweep 3b updates the profile dialog to read +
-- write the new shape; Sweep 3c migrates the calc engine + the
-- consumers. A future cleanup migration (post-3c verification) drops
-- the deprecated columns (creators.agreement_links, creators.tax_id).
--
-- WHY
-- ───
-- Gustavo (T3):
--   • "If they have more than one page... So OnlyFans Charlotte VIP,
--     Charlotte Free and then add a tier" — per-page commission.
--   • "there are amendments. So there could be more than one
--     agreement per page" — multi-agreement table.
--   • "the NDA could be a part of the talent" — NDA toggle on creators
--     (mirrors what vendors have).

-- ============================================================
-- 1. NDA fields on creators (mirror of vendors.nda_signed + nda_url)
-- ============================================================

alter table creators
  add column if not exists nda_signed boolean not null default false,
  add column if not exists nda_url text;

comment on column creators.nda_signed is
  'R5 Sweep 3 (Gustavo, T1): NDA signed flag. Mirrors '
  'vendors.nda_signed. The talent profile dialog surfaces this in '
  'the Tax info / NDA section.';

comment on column creators.nda_url is
  'R5 Sweep 3: Drive/Dropbox link to the signed NDA. Optional.';


-- ============================================================
-- 2. creator_agreements table for multi-agreement support
-- ============================================================
-- Replaces the agreement_links JSON map on creators. Each row is
-- one agreement (or amendment) for one (creator, platform, page).
-- Allowing multiple rows per (platform, page) is the whole point —
-- amendments stack alongside the original agreement.
--
-- Per Gustavo (T3): "there are amendments. So there could be more
-- than one agreement per page". Page name defaults to 'main' for
-- platforms where the page concept doesn't fully apply (Telegram,
-- Overlay) — keeps the shape consistent across platforms.

create table if not exists creator_agreements (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references creators(id) on delete cascade,
  platform     text not null check (platform in ('onlyfans', 'telegram', 'efuse', 'deal', 'other')),
  page_name    text not null default 'main',
  label        text not null default 'Agreement',
  url          text not null,
  signed_at    timestamptz,
  notes        text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists creator_agreements_creator_idx
  on creator_agreements(creator_id);
create index if not exists creator_agreements_platform_idx
  on creator_agreements(platform);

comment on table creator_agreements is
  'R5 Sweep 3: one row per signed agreement (or amendment) per '
  '(creator, platform, page). Replaces creators.agreement_links '
  '— the flat JSON map only supported one URL per platform. '
  'creator_id cascade-deletes so leaving a creator removes '
  'their agreements too.';


-- ============================================================
-- 3. updated_at auto-touch trigger
-- ============================================================

create or replace function creator_agreements_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_creator_agreements_updated_at on creator_agreements;
create trigger trg_creator_agreements_updated_at
  before update on creator_agreements
  for each row execute function creator_agreements_touch_updated_at();


-- ============================================================
-- 4. RLS — admin/finance write, all roles read
-- ============================================================

alter table creator_agreements enable row level security;

drop policy if exists creator_agreements_select on creator_agreements;
create policy creator_agreements_select
  on creator_agreements for select
  to authenticated
  using (true);

drop policy if exists creator_agreements_write on creator_agreements;
create policy creator_agreements_write
  on creator_agreements for all
  to authenticated
  using (
    exists (
      select 1 from profiles
       where profiles.id = auth.uid()
         and profiles.role in ('admin', 'finance')
    )
  )
  with check (
    exists (
      select 1 from profiles
       where profiles.id = auth.uid()
         and profiles.role in ('admin', 'finance')
    )
  );


-- ============================================================
-- 5. Backfill creator_agreements from creators.agreement_links
-- ============================================================
-- For each (creator, platform) with a non-empty URL in the JSON
-- map, insert one creator_agreements row. Page defaults to 'main',
-- label defaults to 'Agreement'. Idempotent — skips inserts where
-- a row for that (creator, platform, page=main, url) already
-- exists (the URL check stops re-runs from inserting duplicates
-- even if labels differ).

insert into creator_agreements (creator_id, platform, page_name, label, url)
select
  c.id,
  agr.key as platform,
  'main',
  'Agreement',
  trim(both '"' from agr.value::text)
from creators c,
     jsonb_each(c.agreement_links) as agr(key, value)
where c.agreement_links is not null
  and c.agreement_links <> '{}'::jsonb
  and agr.value is not null
  and jsonb_typeof(agr.value) = 'string'
  and (agr.value::text <> '""' and trim(both '"' from agr.value::text) <> '')
  and agr.key in ('onlyfans', 'telegram', 'efuse', 'deal', 'other')
  and not exists (
    select 1 from creator_agreements ca
    where ca.creator_id  = c.id
      and ca.platform    = agr.key
      and ca.page_name   = 'main'
      and ca.url         = trim(both '"' from agr.value::text)
  );


-- ============================================================
-- 6. Restructure creators.commission_tiers
-- ============================================================
-- Old shape:  { platform: [tiers] }
-- New shape:  { platform: { page_name: [tiers] } }
--
-- For each platform whose value is an array, wrap that array under
-- a "main" page key. Already-nested objects pass through unchanged
-- so re-runs are safe.

update creators
   set commission_tiers = (
     select coalesce(
       jsonb_object_agg(
         t.platform,
         case
           -- Already nested (object): pass through
           when jsonb_typeof(t.value) = 'object' then t.value
           -- Legacy flat array: wrap as { "main": [...] }
           when jsonb_typeof(t.value) = 'array'  then jsonb_build_object('main', t.value)
           -- Anything else (null, scalar): drop silently
           else null
         end
       ) filter (where t.value is not null),
       '{}'::jsonb
     )
     from jsonb_each(commission_tiers) as t(platform, value)
   )
 where commission_tiers is not null
   and commission_tiers <> '{}'::jsonb
   and exists (
     -- Only run on rows that still have array-shaped tiers (i.e. not
     -- already migrated). Idempotency guard.
     select 1
       from jsonb_each(commission_tiers) as t2(p, v)
      where jsonb_typeof(v) = 'array'
   );


-- ============================================================
-- 7. Comment legacy columns as deprecated
-- ============================================================
-- These stay readable for 3b/3c to use as fallbacks during the
-- transition. Dropped by a later cleanup migration once everything
-- is reading from the new shape.

comment on column creators.agreement_links is
  'DEPRECATED (R5 Sweep 3a): replaced by creator_agreements table. '
  'Kept as a read-only fallback during the 3a→3b→3c transition. '
  'Dropped by a future cleanup migration.';

comment on column creators.tax_id is
  'DEPRECATED (R5 Sweep 3a): replaced by the W9 link concept '
  '(creators.w9_url) + requires_tax_info toggle. Kept for the '
  'transition window so existing tax_id values are preserved. '
  'Dropped by a future cleanup migration once Gustavo confirms '
  'the W9 flow is sufficient.';
