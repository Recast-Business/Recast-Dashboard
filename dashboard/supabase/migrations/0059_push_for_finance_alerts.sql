-- 0059_push_for_finance_alerts.sql
-- Round 4 (Max): extend Web Push (0057) to the finance/security
-- notifications built earlier this session (0052) — overdue payment
-- alert, weekly digest, and the two admin/security alert triggers —
-- which were email-only until now. Requires 0057 (push_subscriptions,
-- _send_push) already applied.
--
-- Recipients are unchanged from 0052: overdue alert + weekly digest
-- go to admin + accounting (Max + Gus); security/vault alerts stay
-- admin-only. Push is additive — email keeps going out exactly as
-- before, this just adds a second, more immediate channel for people
-- who've opted into push in their browser.
--
-- VERIFY AFTER RUNNING:
--   select _check_overdue_and_notify();   -- safe to run any time, manual test
--   select _weekly_digest_and_notify();   -- same

create or replace function _check_overdue_and_notify() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_rows_html text := '';
  v_count int := 0;
  v_recipients text[];
  v_recipient_ids uuid[];
begin
  for v_row in select * from _overdue_rows(1, 3) order by days_overdue desc loop
    v_rows_html := v_rows_html || format(
      '<tr><td>%s</td><td>%s</td><td>$%s</td><td>%s day(s)</td></tr>',
      v_row.source, v_row.who, to_char(v_row.amount, 'FM999,999,990.00'), v_row.days_overdue
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    return;  -- quiet by default
  end if;

  select array_agg(email), array_agg(id) into v_recipients, v_recipient_ids
  from profiles where role in ('admin', 'accounting');

  begin
    perform _send_email(
      v_recipients,
      format('%s payment%s just went overdue', v_count, case when v_count = 1 then '' else 's' end),
      format(
        '<h2>Overdue payments</h2>' ||
        '<table border="1" cellpadding="6" style="border-collapse:collapse">' ||
        '<tr><th>Type</th><th>Who</th><th>Amount</th><th>Overdue by</th></tr>%s</table>' ||
        '<p>Log a receipt on the Payments page to clear these.</p>',
        v_rows_html
      )
    );
  exception when others then
    raise warning 'overdue-alert email failed: %', sqlerrm;
  end;

  begin
    perform _send_push(
      v_recipient_ids,
      format('%s payment%s overdue', v_count, case when v_count = 1 then '' else 's' end),
      'Log a receipt on the Payments page to clear these.',
      '/payments'
    );
  exception when others then
    raise warning 'overdue-alert push failed: %', sqlerrm;
  end;
end $$;

create or replace function _weekly_digest_and_notify() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_receipts_count int;
  v_receipts_total numeric;
  v_overdue_count int;
  v_new_campaigns int;
  v_new_creators int;
  v_recipients text[];
  v_recipient_ids uuid[];
  v_html text;
begin
  select count(*), coalesce(sum(amount), 0) into v_receipts_count, v_receipts_total
  from payment_receipts where received_at >= current_date - 7;

  select count(*) into v_overdue_count from _overdue_rows(1, null);

  select count(*) into v_new_campaigns from campaigns where created_at >= now() - interval '7 days';
  select count(*) into v_new_creators from creators where created_at >= now() - interval '7 days';

  select array_agg(email), array_agg(id) into v_recipients, v_recipient_ids
  from profiles where role in ('admin', 'accounting');
  if v_recipients is null or array_length(v_recipients, 1) = 0 then return; end if;

  v_html := format(
    '<h2>Weekly digest — %s</h2><ul>' ||
    '<li><strong>%s</strong> receipt(s) logged ($%s total)</li>' ||
    '<li><strong>%s</strong> payment(s) currently overdue</li>' ||
    '<li><strong>%s</strong> new campaign(s) this week</li>' ||
    '<li><strong>%s</strong> new creator(s) signed this week</li>' ||
    '</ul>',
    to_char(current_date, 'FMMonth DD, YYYY'),
    v_receipts_count, to_char(v_receipts_total, 'FM999,999,990.00'),
    v_overdue_count, v_new_campaigns, v_new_creators
  );

  begin
    perform _send_email(v_recipients, 'Recast weekly digest', v_html);
  exception when others then
    raise warning 'weekly-digest email failed: %', sqlerrm;
  end;

  begin
    perform _send_push(
      v_recipient_ids,
      'Weekly digest',
      format(
        '%s receipt(s), %s overdue, %s new campaign(s), %s new creator(s)',
        v_receipts_count, v_overdue_count, v_new_campaigns, v_new_creators
      ),
      '/overview'
    );
  exception when others then
    raise warning 'weekly-digest push failed: %', sqlerrm;
  end;
end $$;

create or replace function _notify_security_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recipients text[];
  v_recipient_ids uuid[];
  v_actor_email text;
  v_target_email text;
begin
  select array_agg(email), array_agg(id) into v_recipients, v_recipient_ids
  from profiles where role = 'admin';
  if v_recipients is null or array_length(v_recipients, 1) = 0 then
    return new;
  end if;

  select email into v_actor_email from profiles where id = new.actor_id;
  if new.payload ? 'target_user_id' then
    select email into v_target_email from profiles where id = (new.payload->>'target_user_id')::uuid;
  end if;

  -- CRITICAL: this trigger fires inline, inside the SAME transaction
  -- as the admin action that inserted this activity_log row. Both
  -- the email and push calls are exception-wrapped so a notification
  -- failure never rolls back the underlying admin action.
  begin
    perform _send_email(
      v_recipients,
      format('Admin action: %s', new.kind::text),
      format(
        '<p><strong>%s</strong> by %s</p><p>Target: %s</p><pre>%s</pre>',
        new.kind::text, coalesce(v_actor_email, 'unknown'),
        coalesce(v_target_email, coalesce(new.payload->>'email', 'n/a')),
        new.payload::text
      )
    );
  exception when others then
    raise warning 'security-alert email failed: %', sqlerrm;
  end;

  begin
    perform _send_push(
      v_recipient_ids,
      format('Admin action: %s', new.kind::text),
      format('By %s — %s', coalesce(v_actor_email, 'unknown'), coalesce(v_target_email, coalesce(new.payload->>'email', 'n/a'))),
      '/admin'
    );
  exception when others then
    raise warning 'security-alert push failed: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function _notify_vault_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recipients text[];
  v_recipient_ids uuid[];
begin
  select array_agg(email), array_agg(id) into v_recipients, v_recipient_ids
  from profiles where role = 'admin';
  if v_recipients is null or array_length(v_recipients, 1) = 0 then
    return new;
  end if;

  -- Same reasoning as _notify_security_event — fires inline with
  -- vault_get_banking / vault_upsert_banking / vault_delete_banking's
  -- own transaction. A notification failure must never block banking
  -- access.
  begin
    perform _send_email(
      v_recipients,
      format('Vault %s: banking record modified', new.action),
      format(
        '<p><strong>%s</strong> on banking record %s</p><p>By: %s (%s)</p><p>Fields: %s</p>',
        new.action, new.banking_id, coalesce(new.user_email, 'unknown'),
        coalesce(new.user_role::text, 'n/a'), array_to_string(new.fields, ', ')
      )
    );
  exception when others then
    raise warning 'vault-access email failed: %', sqlerrm;
  end;

  begin
    perform _send_push(
      v_recipient_ids,
      format('Vault %s', new.action),
      format('Banking record modified by %s', coalesce(new.user_email, 'unknown')),
      '/admin'
    );
  exception when others then
    raise warning 'vault-access push failed: %', sqlerrm;
  end;
  return new;
end $$;
