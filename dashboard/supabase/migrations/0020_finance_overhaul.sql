-- 0020_finance_overhaul.sql
-- Phase A of the Gustavo Finance overhaul.
-- Drops the legacy campaign + payments schema and replaces it with:
--   • Division tagging on creators (onlyfans / telegram / efuse)
--   • Vendor / Talent records + monthly payment grid
--   • Banking details + vault access audit log
--   • Frazier's House (residents, utilities, monthly payments)
--   • Telegram + OnlyFans deal + period-performance schema
--   • New campaigns / campaign_creators / campaign_payments (eFuse)
-- The encryption-at-rest layer (pgsodium) lands in Phase B.
-- All sensitive tables are RLS-locked to admin + finance from the start.

-- ============================================================
-- 1. Drop legacy tables, triggers, functions
-- ============================================================

-- Triggers first (silently — idempotent)
drop trigger if exists trg_campaign_created on campaigns;
drop trigger if exists trg_creator_added on campaign_creators;
drop trigger if exists trg_campaign_creator_update on campaign_creators;
drop trigger if exists trg_overdue_flagged on campaigns;
drop trigger if exists trg_promote_brief on briefs;

drop function if exists log_campaign_created() cascade;
drop function if exists log_creator_added() cascade;
drop function if exists log_campaign_creator_update() cascade;
drop function if exists log_overdue_flagged() cascade;
drop function if exists promote_brief_to_campaign() cascade;

-- Disconnect briefs.linked_campaign_id from old campaigns BEFORE we drop them
update briefs set linked_campaign_id = null where linked_campaign_id is not null;
alter table briefs drop constraint if exists briefs_linked_campaign_id_fkey;

-- Pull realtime publication memberships before drop
do $$
begin
  perform 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'campaign_creators';
  if found then alter publication supabase_realtime drop table campaign_creators; end if;
  perform 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'campaigns';
  if found then alter publication supabase_realtime drop table campaigns; end if;
end $$;

-- Drop legacy data tables (CASCADE pulls dependent views, FKs, indexes)
drop view if exists campaign_creators_public cascade;
drop table if exists payments cascade;
drop table if exists campaign_creators cascade;
drop table if exists campaigns cascade;
drop table if exists brands cascade;

-- Old enums (we'll re-create where needed in the new schema)
drop type if exists payment_status cascade;
drop type if exists campaign_status cascade;

-- Activity log table is kept; campaign_id FK becomes orphan-but-nullable.
-- (already declared `on delete set null`, but the column will be re-FK'd to the new campaigns below)
alter table activity_log drop constraint if exists activity_log_campaign_id_fkey;

-- ============================================================
-- 2. Shared types
-- ============================================================

create type division as enum ('onlyfans', 'telegram', 'efuse');

create type vendor_kind as enum (
  'vendor',
  'talent_we_pay',
  'talent_that_pays_us',
  'utility',
  'employee',
  'credit_card_account'
);

create type payment_method as enum (
  'auto_pay',
  'paypal',
  'domestic_wire',
  'international_transfer',
  'bank_ach',
  'zelle',
  'invoice_link',
  'website_link',
  'credit_card'
);

create type payment_status as enum (
  'unpaid',
  'partial',
  'paid',
  'overdue'
);

create type campaign_status as enum (
  'pending',
  'active',
  'awaiting_payment',
  'overdue',
  'completed'
);

create type tele_commission_basis as enum ('gross', 'net');

-- ============================================================
-- 3. Reusable helpers
-- ============================================================

-- Generic updated_at trigger (we use it on every mutable new table)
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============================================================
-- 4. Creators: division tagging
-- ============================================================

alter table creators
  add column if not exists divisions division[] not null default '{}'::division[];

create index if not exists creators_divisions_idx on creators using gin (divisions);

comment on column creators.divisions is
  'Revenue streams the creator participates in. Multi-value (e.g. {onlyfans,telegram}).';

-- ============================================================
-- 5. Vendors / Talents (one shape, three uses)
-- ============================================================

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind vendor_kind not null,
  division division,                          -- nullable: bills can be cross-division
  payment_method payment_method,              -- nullable: not always known
  contact_name text,
  contact_email text,
  contact_phone text,
  account_profile text,                       -- e.g. "Recast Chase", "Personal Stripe"
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index vendors_kind_idx on vendors(kind);
create index vendors_division_idx on vendors(division);
create index vendors_name_idx on vendors(name);

create trigger trg_vendors_updated_at before update on vendors
  for each row execute function set_updated_at();

comment on table vendors is
  'Counterparties: vendors we pay, talents we pay, talents that pay us, utilities, employees, credit-card accounts.';

-- ============================================================
-- 6. Banking details (sensitive — RLS-locked)
-- ============================================================
-- Phase A stores plaintext + strict RLS; Phase B will swap to pgsodium-encrypted bytea columns.

create table banking_details (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  bank_name text,
  account_holder text,
  swift_sort text,                            -- SWIFT code OR sort code
  aba_iban_bsb_ifsc text,                     -- ABA/IBAN/BSB/IFSC routing identifier
  account_number text,                        -- account number (NEVER full PAN)
  card_brand text,                            -- 'visa' | 'mastercard' | 'amex' | etc.
  card_last4 text,                            -- ALWAYS only last 4 digits
  card_holder text,
  card_expiry text,                           -- 'MM/YY'
  account_profile text,                       -- e.g. "Recast Brex Card"
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Must attach to either a vendor or a creator (not both)
  constraint banking_details_owner_chk
    check (
      (vendor_id is not null and creator_id is null)
      or (vendor_id is null and creator_id is not null)
    ),
  constraint banking_details_card_last4_chk
    check (card_last4 is null or card_last4 ~ '^[0-9]{4}$')
);

create index banking_details_vendor_idx on banking_details(vendor_id);
create index banking_details_creator_idx on banking_details(creator_id);

create trigger trg_banking_details_updated_at before update on banking_details
  for each row execute function set_updated_at();

comment on table banking_details is
  'Sensitive payment-rail details. RLS-locked to admin + finance. Phase B will encrypt at rest via pgsodium. Card PAN must NEVER be stored — last4 only.';

-- ============================================================
-- 7. Vault access audit log
-- ============================================================
-- Every read or write of banking_details should produce a row here (wired in Phase B).

create table vault_access_log (
  id bigserial primary key,
  banking_id uuid,                            -- intentionally no FK — log survives row deletes
  user_id uuid references profiles(id),
  user_email text,
  user_role user_role,
  action text not null,                       -- 'view' | 'create' | 'update' | 'delete'
  ip_address text,
  user_agent text,
  fields text[],                              -- which fields were touched (e.g. {account_number,swift_sort})
  accessed_at timestamptz not null default now()
);

create index vault_access_log_banking_idx on vault_access_log(banking_id);
create index vault_access_log_user_idx on vault_access_log(user_id);
create index vault_access_log_accessed_idx on vault_access_log(accessed_at desc);

comment on table vault_access_log is
  'Append-only audit trail for sensitive banking access. Read-only for everyone (admin can SELECT; nobody mutates directly).';

-- ============================================================
-- 8. Vendor monthly payments grid
-- ============================================================

create table vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  status payment_status not null default 'unpaid',
  amount numeric(12,2),
  paid_at date,
  invoice_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, period_year, period_month)
);

create index vendor_payments_period_idx on vendor_payments(period_year, period_month);
create index vendor_payments_status_idx on vendor_payments(status);

create trigger trg_vendor_payments_updated_at before update on vendor_payments
  for each row execute function set_updated_at();

-- ============================================================
-- 9. Frazier's House
-- ============================================================

create table house_residents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bedroom text not null,                      -- 'Master', 'Bedroom 1', etc.
  monthly_rent numeric(10,2) not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create unique index house_residents_active_name_idx
  on house_residents(lower(name)) where active;

create table house_utilities (
  id uuid primary key default gen_random_uuid(),
  utility_name text not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create unique index house_utilities_active_name_idx
  on house_utilities(lower(utility_name)) where active;

create table house_utility_payments (
  id uuid primary key default gen_random_uuid(),
  utility_id uuid not null references house_utilities(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount numeric(10,2) not null default 0,    -- total bill for the month
  status payment_status not null default 'unpaid',
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (utility_id, period_year, period_month)
);

create trigger trg_house_utility_payments_updated_at before update on house_utility_payments
  for each row execute function set_updated_at();

create table house_rent_payments (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references house_residents(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount numeric(10,2) not null,              -- usually = resident.monthly_rent
  status payment_status not null default 'unpaid',
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resident_id, period_year, period_month)
);

create trigger trg_house_rent_payments_updated_at before update on house_rent_payments
  for each row execute function set_updated_at();

comment on table house_residents is 'Active household members. Each utility split equal-per-head among active residents.';

-- ============================================================
-- 10. Telegram (per-creator)
-- ============================================================

create table tele_deals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  recast_commission_pct numeric(5,2) not null,
  commission_basis tele_commission_basis not null default 'net',
  min_guarantee numeric(12,2),                -- nullable: not every creator has MG
  contract_start date not null,
  contract_end date not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contract_end >= contract_start)
);

create index tele_deals_creator_idx on tele_deals(creator_id);
create index tele_deals_active_idx on tele_deals(active);

create trigger trg_tele_deals_updated_at before update on tele_deals
  for each row execute function set_updated_at();

create table tele_period_performance (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  gross_revenue numeric(12,2) not null default 0,
  net_revenue numeric(12,2) not null default 0,           -- typically 50% of gross (Telegram platform fee)
  mg_top_up numeric(12,2) not null default 0,             -- calculated: max(0, MG - net) when qualifies
  recast_commission numeric(12,2) not null default 0,     -- calculated: applied to (net + mg_top_up)
  qualified_for_mg boolean not null default false,        -- net >= 50% of MG
  status payment_status not null default 'unpaid',
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, period_year, period_month)
);

create index tele_period_creator_idx on tele_period_performance(creator_id);
create index tele_period_period_idx on tele_period_performance(period_year, period_month);

create trigger trg_tele_period_updated_at before update on tele_period_performance
  for each row execute function set_updated_at();

-- ============================================================
-- 11. OnlyFans (per-creator, supports multiple pages per creator)
-- ============================================================

create table of_deals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  page_name text not null,                                -- e.g. "Charlotte Free", "Charlotte VIP"
  recast_pct numeric(5,2) not null,                       -- Recast's commission %
  basis tele_commission_basis not null default 'net',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, page_name)
);

create index of_deals_creator_idx on of_deals(creator_id);

create trigger trg_of_deals_updated_at before update on of_deals
  for each row execute function set_updated_at();

create table of_period_performance (
  id uuid primary key default gen_random_uuid(),
  of_deal_id uuid not null references of_deals(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  gross_revenue numeric(12,2) not null default 0,
  net_revenue numeric(12,2) not null default 0,
  recast_commission numeric(12,2) not null default 0,     -- calculated
  girls_share numeric(12,2) not null default 0,           -- calculated (creator's cut)
  status payment_status not null default 'unpaid',
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (of_deal_id, period_year, period_month)
);

create index of_period_deal_idx on of_period_performance(of_deal_id);
create index of_period_period_idx on of_period_performance(period_year, period_month);

create trigger trg_of_period_updated_at before update on of_period_performance
  for each row execute function set_updated_at();

-- ============================================================
-- 12. eFuse Campaigns (rebuilt — no weekly_cap / daily_log)
-- ============================================================

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,                                    -- denormalised — brands table is gone
  campaign_type text,                                     -- dropdown: 'cpm' | 'flat_fee' | 'hybrid' | etc.
  status campaign_status not null default 'pending',
  default_commission_pct numeric(5,2) not null default 20.00,
  description text,
  start_date date,
  end_date date,
  is_ad_overlay boolean not null default false,
  brief_id uuid,                                          -- FK re-added below in the briefs section
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index campaigns_status_idx on campaigns(status);
create index campaigns_brand_idx on campaigns(brand);

create trigger trg_campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

create table campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete restrict,
  -- Per-creator overrides (null = inherit from campaign default)
  commission_pct numeric(5,2),                            -- per-creator commission override
  start_date date,
  end_date date,
  -- Deal structure
  deal_type text not null default 'cpm',                  -- 'cpm' | 'flat_fee' | 'per_stream' | 'hybrid'
  -- CPM-specific (cost per thousand views)
  cpm_rate numeric(10,2),
  views bigint,                                           -- the unit being CPM-counted
  displays bigint,                                        -- informational
  clicks bigint,                                          -- informational
  ctr_pct numeric(5,2),                                   -- informational, can be calculated client-side
  -- Flat / hybrid
  flat_amount numeric(12,2),
  per_stream_rate numeric(10,2),
  stream_count int,
  -- Cached calc results (recomputed on every save)
  cached_earnings numeric(12,2) not null default 0,
  cached_commission numeric(12,2) not null default 0,
  manual_inputs jsonb not null default '{}'::jsonb,       -- override hooks (gross, commission, note)
  notes text,
  last_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index campaign_creators_campaign_idx on campaign_creators(campaign_id);
create index campaign_creators_creator_idx on campaign_creators(creator_id);

create trigger trg_campaign_creators_updated_at before update on campaign_creators
  for each row execute function set_updated_at();

create table campaign_payments (
  id uuid primary key default gen_random_uuid(),
  campaign_creator_id uuid not null references campaign_creators(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount numeric(12,2) not null default 0,                -- amount actually paid this period
  status payment_status not null default 'unpaid',
  paid_at date,
  invoice_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_creator_id, period_year, period_month)
);

create index campaign_payments_cc_idx on campaign_payments(campaign_creator_id);
create index campaign_payments_period_idx on campaign_payments(period_year, period_month);
create index campaign_payments_status_idx on campaign_payments(status);

create trigger trg_campaign_payments_updated_at before update on campaign_payments
  for each row execute function set_updated_at();

-- Re-attach briefs.linked_campaign_id FK to the new campaigns table
alter table briefs
  add constraint briefs_linked_campaign_id_fkey
  foreign key (linked_campaign_id) references campaigns(id) on delete set null;

-- Re-attach activity_log.campaign_id FK
alter table activity_log
  add constraint activity_log_campaign_id_fkey
  foreign key (campaign_id) references campaigns(id) on delete set null;

-- ============================================================
-- 13. Row-level security
-- ============================================================

-- Default deny on all new tables; explicit allow for admin (and finance where appropriate).

-- Vendors: admin + finance read/write
alter table vendors enable row level security;
create policy vendors_admin on vendors for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy vendors_finance on vendors for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- Banking details: admin + finance ONLY (Phase B will add the SECURITY DEFINER access fn)
alter table banking_details enable row level security;
create policy banking_admin on banking_details for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy banking_finance on banking_details for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- Vault access log: admin reads, nobody writes directly (writes via SECURITY DEFINER fn in Phase B)
alter table vault_access_log enable row level security;
create policy vault_log_admin_read on vault_access_log for select
  using (auth_role() = 'admin');

-- Vendor payments
alter table vendor_payments enable row level security;
create policy vendor_payments_admin on vendor_payments for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy vendor_payments_finance on vendor_payments for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- House (admin + finance — household members will be added in Phase E if needed)
alter table house_residents enable row level security;
create policy house_residents_admin on house_residents for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy house_residents_finance on house_residents for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter table house_utilities enable row level security;
create policy house_utilities_admin on house_utilities for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy house_utilities_finance on house_utilities for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter table house_utility_payments enable row level security;
create policy house_util_pay_admin on house_utility_payments for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy house_util_pay_finance on house_utility_payments for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter table house_rent_payments enable row level security;
create policy house_rent_pay_admin on house_rent_payments for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy house_rent_pay_finance on house_rent_payments for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- Telegram
alter table tele_deals enable row level security;
create policy tele_deals_admin on tele_deals for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy tele_deals_finance on tele_deals for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter table tele_period_performance enable row level security;
create policy tele_period_admin on tele_period_performance for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy tele_period_finance on tele_period_performance for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- OnlyFans
alter table of_deals enable row level security;
create policy of_deals_admin on of_deals for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy of_deals_finance on of_deals for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter table of_period_performance enable row level security;
create policy of_period_admin on of_period_performance for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy of_period_finance on of_period_performance for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- Campaigns (eFuse) — admin + finance write; partner read
alter table campaigns enable row level security;
create policy campaigns_admin on campaigns for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy campaigns_finance on campaigns for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');
create policy campaigns_partner_r on campaigns for select
  using (auth_role() = 'partner');

alter table campaign_creators enable row level security;
create policy campaign_creators_admin on campaign_creators for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy campaign_creators_finance on campaign_creators for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');
-- partner reads via _public view (Phase F)

alter table campaign_payments enable row level security;
create policy campaign_payments_admin on campaign_payments for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy campaign_payments_finance on campaign_payments for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- ============================================================
-- 14. Realtime publication
-- ============================================================

alter publication supabase_realtime add table campaigns;
alter publication supabase_realtime add table campaign_creators;
alter publication supabase_realtime add table campaign_payments;
alter publication supabase_realtime add table vendor_payments;
alter publication supabase_realtime add table tele_period_performance;
alter publication supabase_realtime add table of_period_performance;

-- ============================================================
-- 15. Seed Frazier's House
-- ============================================================

insert into house_residents (name, bedroom, monthly_rent) values
  ('Frazier',           'Master',     1950.00),
  ('Charlotte',         'Master',     1950.00),
  ('Harriet & Keenan',  'Bedroom 1',  1200.00),
  ('Teeqo',             'Bedroom 2',  1200.00),
  ('Nikan',             'Bedroom 3',  1200.00)
on conflict do nothing;

insert into house_utilities (utility_name) values
  ('ADT Security System'),
  ('COX'),
  ('Las Vegas Valley Water District'),
  ('NV Energy'),
  ('Southwest Gas'),
  ('Trash & Sewage'),
  ('Cleaning Fees'),
  ('House Services')
on conflict do nothing;
