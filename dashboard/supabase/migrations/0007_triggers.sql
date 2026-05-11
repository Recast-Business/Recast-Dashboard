-- 0007_triggers.sql
-- Activity log triggers + brief → campaign auto-promote.

-- --- Activity log: campaign_created ---
create or replace function log_campaign_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (kind, actor_id, campaign_id, payload)
  values (
    'campaign_created',
    new.created_by,
    new.id,
    jsonb_build_object('name', new.name, 'status', new.status)
  );
  return new;
end $$;
drop trigger if exists trg_campaign_created on campaigns;
create trigger trg_campaign_created
  after insert on campaigns
  for each row execute function log_campaign_created();

-- --- Activity log: creator_added to a campaign ---
create or replace function log_creator_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (kind, actor_id, campaign_id, creator_id, payload)
  values (
    'creator_added',
    auth.uid(),
    new.campaign_id,
    new.creator_id,
    jsonb_build_object('campaign_creator_id', new.id)
  );
  return new;
end $$;
drop trigger if exists trg_creator_added on campaign_creators;
create trigger trg_creator_added
  after insert on campaign_creators
  for each row execute function log_creator_added();

-- --- Activity log: payment_status_changed OR earnings_updated ---
create or replace function log_campaign_creator_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status is distinct from old.payment_status then
    insert into activity_log (kind, actor_id, campaign_id, creator_id, payload)
    values (
      'payment_status_changed',
      auth.uid(),
      new.campaign_id,
      new.creator_id,
      jsonb_build_object('from', old.payment_status, 'to', new.payment_status)
    );
  end if;

  if new.cached_earnings is distinct from old.cached_earnings
     and abs(new.cached_earnings - old.cached_earnings)
         > greatest(old.cached_earnings * 0.05, 1) then
    insert into activity_log (kind, actor_id, campaign_id, creator_id, payload)
    values (
      'earnings_updated',
      auth.uid(),
      new.campaign_id,
      new.creator_id,
      jsonb_build_object('from', old.cached_earnings, 'to', new.cached_earnings)
    );
  end if;

  return new;
end $$;
drop trigger if exists trg_campaign_creator_update on campaign_creators;
create trigger trg_campaign_creator_update
  after update on campaign_creators
  for each row execute function log_campaign_creator_update();

-- --- Activity log: overdue_flagged when campaign status transitions to overdue ---
create or replace function log_overdue_flagged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'overdue' and old.status is distinct from 'overdue' then
    insert into activity_log (kind, actor_id, campaign_id, payload)
    values (
      'overdue_flagged',
      auth.uid(),
      new.id,
      jsonb_build_object('name', new.name)
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_overdue_flagged on campaigns;
create trigger trg_overdue_flagged
  after update on campaigns
  for each row execute function log_overdue_flagged();

-- --- Brief → Campaign auto-promote ---
create or replace function promote_brief_to_campaign() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_campaign_id uuid;
  brand_uuid uuid;
  brand_name text;
begin
  if new.stage = 'exclusive'
     and (old.stage is distinct from 'exclusive')
     and new.linked_campaign_id is null then

    brand_name := coalesce(nullif(trim(new.brand), ''), new.title);

    insert into brands (name)
      values (brand_name)
      on conflict (name) do update set name = excluded.name
      returning id into brand_uuid;

    insert into campaigns (brand_id, name, status, brief_id, created_by)
      values (brand_uuid, new.title, 'pending', new.id, new.created_by)
      returning id into new_campaign_id;

    new.linked_campaign_id := new_campaign_id;

    insert into activity_log (kind, actor_id, campaign_id, payload)
      values (
        'brief_promoted',
        auth.uid(),
        new_campaign_id,
        jsonb_build_object('brief_id', new.id, 'title', new.title)
      );
  end if;
  return new;
end $$;
drop trigger if exists trg_promote_brief on briefs;
create trigger trg_promote_brief
  before update on briefs
  for each row execute function promote_brief_to_campaign();
