-- 0039_tax_tracker.sql
-- Round 4 B (Gustavo): in-platform year-end 1099 / W9 tracker.
--
-- WHY
-- ───
-- Gustavo processes the 1099s himself and wants a dedicated section
-- inside the dashboard (not just a CSV export) where he can track:
--   • W9 received per person — one W9 per person, valid forever
--   • 1099 sent per person per year — one 1099 link per year
--   • Amount reported per person per year (manual entry, set at year end)
--   • Notes
--
-- Eligibility: only people/vendors explicitly TAGGED as needing tax
-- info show up. Default behaviour is "not tracked" — Gustavo flips
-- the flag manually on each subject that needs a 1099.
--
-- All three paying subjects qualify: creators, vendors (companies),
-- vendors (talent_we_pay contractors). The polymorphism is handled
-- via a (subject_kind, subject_id) tuple on tax_records.

-- ============================================================
-- 1. Per-subject "requires tax info" flag + W9 storage
-- ============================================================
-- Both creators and vendors get the same three columns. Mirroring
-- the shape lets the UI and queries treat the two universes
-- symmetrically.

alter table creators
  add column if not exists requires_tax_info boolean not null default false,
  add column if not exists w9_url            text,
  add column if not exists w9_received_at    timestamptz;

comment on column creators.requires_tax_info is
  'Round 4 B: tag this creator for 1099 tracking. Default FALSE — '
  'only US contractors that hit the 1099 threshold get flipped on. '
  'When TRUE the creator surfaces on /tax and is held to the W9 '
  'completeness rule on /talents.';

comment on column creators.w9_url is
  'Round 4 B: Drive/Dropbox link to the signed W9. One W9 per '
  'creator, valid until you replace it.';

comment on column creators.w9_received_at is
  'Round 4 B: timestamp the W9 was received. Independent of '
  'w9_url so you can mark "received" without uploading the link '
  'right away (or vice versa).';

alter table vendors
  add column if not exists requires_tax_info boolean not null default false,
  add column if not exists w9_url            text,
  add column if not exists w9_received_at    timestamptz;

comment on column vendors.requires_tax_info is
  'Round 4 B: tag this vendor for 1099 tracking. Includes both '
  'companies (kind=vendor) and contractors (kind=talent_we_pay).';

comment on column vendors.w9_url is
  'Round 4 B: same shape as creators.w9_url.';

comment on column vendors.w9_received_at is
  'Round 4 B: same shape as creators.w9_received_at.';


-- ============================================================
-- 2. tax_records — one row per (subject, year)
-- ============================================================
-- Polymorphic subject (creator | vendor). No FK to the source
-- tables: if a creator/vendor gets deleted we WANT the tax history
-- to outlive them (audit immutability beats relational cleanliness
-- on financial records). Soft-leak is fine; UI filters out orphans.
--
-- One row per (subject_kind, subject_id, year). The year column is
-- 4-digit calendar year (2026, 2027…).

create table if not exists tax_records (
  id              uuid primary key default gen_random_uuid(),
  subject_kind    text not null check (subject_kind in ('creator', 'vendor')),
  subject_id      uuid not null,
  year            int  not null check (year >= 2000 and year <= 2100),
  amount_reported numeric,
  ten99_url       text,
  ten99_sent_at   timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (subject_kind, subject_id, year)
);

comment on table tax_records is
  'Round 4 B: one row per tracked subject per tax year. Holds the '
  '1099 link, sent timestamp, manually-entered amount_reported, '
  'and free-form notes. W9 lives on the subject (creators/vendors '
  'tables) because it''s person-level not year-level.';

create index if not exists tax_records_subject_idx
  on tax_records(subject_kind, subject_id);
create index if not exists tax_records_year_idx
  on tax_records(year);


-- ============================================================
-- 3. updated_at auto-touch trigger (canonical pattern)
-- ============================================================

create or replace function tax_records_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_tax_records_updated_at on tax_records;
create trigger trg_tax_records_updated_at
  before update on tax_records
  for each row execute function tax_records_touch_updated_at();


-- ============================================================
-- 4. RLS — admin + finance write/read, everyone else nothing
-- ============================================================
-- Tax data is sensitive (SSN-adjacent via the W9 link). Partner +
-- operator have no business seeing it.

alter table tax_records enable row level security;

drop policy if exists tax_records_admin_finance_all on tax_records;
create policy tax_records_admin_finance_all
  on tax_records for all
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
-- Done. Default state for every existing creator/vendor:
--   • requires_tax_info = false (untracked)
--   • w9_url = null
--   • w9_received_at = null
-- Nothing surfaces on /tax until Gustavo flips the flag on a subject.
-- ============================================================
