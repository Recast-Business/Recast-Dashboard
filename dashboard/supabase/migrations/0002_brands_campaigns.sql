-- 0002_brands_campaigns.sql

create type campaign_status as enum (
  'active',
  'pending',
  'awaiting_payment',
  'overdue',
  'completed'
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  contact_email text,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete restrict,
  name text not null,
  status campaign_status not null default 'pending',
  start_date date,
  end_date date,
  payment_due_date date,
  commission_rate numeric(5,2) not null default 20.00,
  is_ad_overlay boolean not null default false,
  brief_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index campaigns_status_idx on campaigns(status);
create index campaigns_brand_idx on campaigns(brand_id);
create index campaigns_payment_due_idx on campaigns(payment_due_date);
