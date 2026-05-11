-- 0004_payments_activity.sql

create table payments (
  id uuid primary key default gen_random_uuid(),
  campaign_creator_id uuid not null references campaign_creators(id) on delete cascade,
  amount numeric(12,2) not null,
  paid_at timestamptz,
  period_start date,
  period_end date,
  notes text
);

create index payments_cc_idx on payments(campaign_creator_id);
create index payments_paid_at_idx on payments(paid_at);

create type activity_kind as enum (
  'campaign_created',
  'creator_added',
  'earnings_updated',
  'payment_status_changed',
  'overdue_flagged',
  'brief_promoted'
);

create table activity_log (
  id bigserial primary key,
  kind activity_kind not null,
  actor_id uuid references profiles(id),
  campaign_id uuid references campaigns(id) on delete set null,
  creator_id uuid references creators(id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_created_idx on activity_log(created_at desc);
create index activity_log_campaign_idx on activity_log(campaign_id);

-- Publish to realtime for admin + finance subscribers.
alter publication supabase_realtime add table activity_log;
alter publication supabase_realtime add table campaign_creators;
alter publication supabase_realtime add table campaigns;
