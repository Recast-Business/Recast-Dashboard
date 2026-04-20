-- 0005_briefs.sql

create type brief_stage as enum ('idea', 'outreach', 'negotiating', 'exclusive', 'lost');

create table briefs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  stage brief_stage not null default 'idea',
  budget numeric(12,2),
  geo text[],
  platforms text[],
  content_type text,
  notes text,
  linked_campaign_id uuid references campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index briefs_stage_idx on briefs(stage);

-- Partner-visible view of campaign_creators (no financial columns).
create or replace view campaign_creators_public as
select
  id,
  campaign_id,
  creator_id,
  deal_structure,
  manual_inputs,
  payment_due_date,
  last_calculated_at
from campaign_creators;

grant select on campaign_creators_public to anon, authenticated;
