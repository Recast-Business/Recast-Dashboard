-- 0045_vendor_profile_parity.sql
-- R5 Sweep 4: vendor profile gets the same depth as the creator profile
-- got in Sweep 3.
--
-- Schema changes:
--   1. New columns on vendors: legal_name, business_name, address
--      — pure additions, all nullable, no backfill required.
--      (nda_url already exists from migration 0031.)
--   2. New table vendor_agreements — parallels creator_agreements but
--      with no page_name (vendors don't have OF-style multi-page setups).
--      A category enum-ish field replaces page_name as the secondary
--      grouping (MSA / SOW / NDA / DPA / Other).
--
-- IDEMPOTENT — every operation guarded with IF NOT EXISTS.

-- ============================================================
-- 1. vendors column additions
-- ============================================================
alter table vendors
  add column if not exists legal_name    text,
  add column if not exists business_name text,
  add column if not exists address       text;

comment on column vendors.legal_name is
  'R5 Sweep 4: vendor primary contact legal name (for invoicing / tax).';
comment on column vendors.business_name is
  'R5 Sweep 4: vendor entity / business name (often differs from legal).';
comment on column vendors.address is
  'R5 Sweep 4: billing / contact address. Free-form single-line for now.';

-- ============================================================
-- 2. vendor_agreements table
-- ============================================================
-- One row per signed agreement (or amendment) per vendor. Vendors don't
-- have OF-style pages, so the secondary grouping is `category` instead
-- of `page_name`. Multiple rows per (vendor, category) supported —
-- amendments stack alongside originals.

create table if not exists vendor_agreements (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors(id) on delete cascade,
  category     text not null
                 check (category in ('msa', 'sow', 'nda', 'dpa', 'other'))
                 default 'other',
  label        text not null default 'Agreement',
  url          text not null,
  signed_at    timestamptz,
  notes        text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vendor_agreements_vendor_idx
  on vendor_agreements(vendor_id);
create index if not exists vendor_agreements_category_idx
  on vendor_agreements(category);

comment on table vendor_agreements is
  'R5 Sweep 4: one row per signed agreement (or amendment) per vendor. '
  'Parallels creator_agreements; category replaces page_name as the '
  'secondary grouping (MSA / SOW / NDA / DPA / Other).';

-- updated_at trigger
create or replace function vendor_agreements_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_vendor_agreements_updated_at on vendor_agreements;
create trigger trg_vendor_agreements_updated_at
  before update on vendor_agreements
  for each row execute function vendor_agreements_touch_updated_at();

-- ============================================================
-- 3. RLS
-- ============================================================
-- Mirror creator_agreements policy: any authenticated user reads,
-- admin + finance only write.

alter table vendor_agreements enable row level security;

drop policy if exists vendor_agreements_read on vendor_agreements;
create policy vendor_agreements_read on vendor_agreements
  for select to authenticated using (true);

drop policy if exists vendor_agreements_write on vendor_agreements;
create policy vendor_agreements_write on vendor_agreements
  for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'finance')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'finance')
    )
  );
