-- 0009_payment_activity.sql
-- Register payment_logged activity kind and a trigger on payment inserts.

alter type activity_kind add value if not exists 'payment_logged';

create or replace function log_payment_logged() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cc_campaign uuid;
  cc_creator uuid;
begin
  select campaign_id, creator_id into cc_campaign, cc_creator
  from campaign_creators
  where id = new.campaign_creator_id;

  insert into activity_log (kind, actor_id, campaign_id, creator_id, payload)
  values (
    'payment_logged',
    auth.uid(),
    cc_campaign,
    cc_creator,
    jsonb_build_object(
      'payment_id', new.id,
      'amount', new.amount,
      'paid_at', new.paid_at
    )
  );
  return new;
end $$;

drop trigger if exists trg_payment_logged on payments;
create trigger trg_payment_logged
  after insert on payments
  for each row execute function log_payment_logged();

-- Publish payments to realtime so the expanded history refreshes live.
-- Guarded so re-running the migration doesn't error on already-published tables.
do $$ begin
  alter publication supabase_realtime add table payments;
exception when duplicate_object then null;
end $$;
