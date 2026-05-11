-- 0003_creators_deals.sql

create table creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  twitch_handle text,
  kick_handle text,
  twitter text,
  instagram text,
  country text,
  tier text,
  status text not null default 'active',
  notes text,
  imported_from_excel boolean not null default false,
  created_at timestamptz not null default now()
);

create index creators_name_idx on creators(name);
create unique index creators_twitch_idx on creators(lower(twitch_handle)) where twitch_handle is not null;
create unique index creators_kick_idx on creators(lower(kick_handle)) where kick_handle is not null;

create type payment_status as enum ('unpaid', 'awaiting', 'paid', 'overdue');

create table campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete restrict,
  deal_structure jsonb not null default '[]'::jsonb,   -- DealComponent[]
  manual_inputs jsonb not null default '{}'::jsonb,
  cached_earnings numeric(12,2) not null default 0,
  cached_commission numeric(12,2) not null default 0,
  payment_status payment_status not null default 'unpaid',
  payment_due_date date,
  last_calculated_at timestamptz,
  unique (campaign_id, creator_id)
);

create index campaign_creators_campaign_idx on campaign_creators(campaign_id);
create index campaign_creators_creator_idx on campaign_creators(creator_id);
create index campaign_creators_payment_idx on campaign_creators(payment_status);
