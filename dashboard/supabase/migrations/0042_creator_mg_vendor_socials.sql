-- 0042_creator_mg_vendor_socials.sql
-- Round 5 Sweep 2 (Gustavo, T1 + T2):
--   • Move Min Guarantee + contract start date from tele_deals onto
--     the creator profile. "this whole section would be on the talent"
--   • Add multi-platform handles support to vendors via a socials
--     jsonb column (mirroring creators.socials). Replaces the single
--     username_handle text field with a structured map.
--
-- Additive only. tele_deals.min_guarantee + contract_start/end stay
-- in place for backward compat; existing data is backfilled into
-- the new creator columns. A future migration can drop them once
-- the deal form stops writing to them.

-- ============================================================
-- 1. creators: MG + contract_start
-- ============================================================
-- Min Guarantee is the dollar floor Recast guarantees a creator
-- (Telegram-only at the moment, but storing on the creator means it
-- could extend to other platforms later). Contract start is the
-- date the MG arrangement began.

alter table creators
  add column if not exists min_guarantee  numeric(12, 2),
  add column if not exists contract_start date;

comment on column creators.min_guarantee is
  'R5 Sweep 2: dollar floor Recast guarantees this creator each '
  'month. Used by calcTelePeriod when present; the Telegram deal '
  'form pulls the value from here rather than asking again per deal. '
  'Nullable — not every creator has an MG arrangement.';

comment on column creators.contract_start is
  'R5 Sweep 2: date the MG / contract arrangement began for this '
  'creator. Surfaced on the talent profile alongside MG. Nullable.';


-- ============================================================
-- 2. Backfill from existing tele_deals
-- ============================================================
-- Pull the latest active tele_deal per creator (where MG is set)
-- and copy MG + contract_start onto the creator row. Skips creators
-- whose MG is already populated so re-runs are safe.

update creators c
   set min_guarantee  = sub.min_guarantee,
       contract_start = sub.contract_start
  from (
    select distinct on (creator_id)
           creator_id,
           min_guarantee,
           contract_start
      from tele_deals
     where active = true
       and min_guarantee is not null
     order by creator_id, updated_at desc
  ) sub
 where c.id = sub.creator_id
   and c.min_guarantee is null;


-- ============================================================
-- 3. vendors: socials jsonb for multi-platform handles
-- ============================================================
-- Mirror of creators.socials. Shape: { platform_slug: handle, ... }
-- e.g. { "discord": "alice#1234", "telegram": "@aliceB" }
--
-- The existing vendors.username_handle text field stays in place for
-- backward compat. The dialog now writes structured data into socials
-- but also continues to populate username_handle (using the first
-- entry as a fallback for older rendering paths).

alter table vendors
  add column if not exists socials jsonb not null default '{}'::jsonb;

comment on column vendors.socials is
  'R5 Sweep 2: multi-platform handles for vendors. Shape: '
  '{ platform_slug: handle }. Mirrors creators.socials. The legacy '
  'username_handle column is preserved as a backward-compat shim.';
