-- 0052_notifications.sql
-- Round B: email notifications. Three kinds, all sent from inside
-- Postgres via pg_net (outbound HTTP) + pg_cron (scheduling) — no new
-- GitHub Actions workflow, no new secret-management surface outside
-- Supabase. pg_cron is already enabled (0028); this migration adds
-- pg_net alongside it.
--
--   1. Overdue payment alert  — daily, 08:00 UTC. Fires only when at
--      least one payment crossed into overdue in the last 1–3 days
--      (bounded catch-up window so a missed run doesn't silently
--      drop an alert). Silent when nothing's overdue — no "all
--      clear" spam. Scope: talent_invoices, vendor_payments,
--      vendor_invoices (NOT house rent/utilities — deliberately out
--      of scope per Max). Recipients: admin + accounting.
--
--   2. Weekly digest — Mondays, 08:00 UTC. Receipts logged this week,
--      current overdue count, new campaigns/creators this week.
--      Deliberately does NOT attempt a full cash-in/cash-out split —
--      that would need to mirror useFinanceOverview.ts's multi-table
--      aggregation (of/tele/vendor/campaign/house), which is a
--      separate, larger job. This digest reports what can be
--      verified accurately from a single source per line. Recipients:
--      admin + accounting.
--
--   3. Security alerts — real-time via trigger, not cron. Fires on
--      activity_log inserts of kind user_created/user_deleted/
--      user_updated (the admin_* actions from 0051), and on
--      vault_access_log inserts for anything EXCEPT plain 'view'
--      (routine banking lookups during normal work are expected and
--      would make this noisy; create/update/delete/direct_* are the
--      anomalous ones worth an immediate ping). Recipients: admin only.
--
-- SETUP REQUIRED BEFORE THIS WORKS (do these in order):
--
--   1. Create a Resend account, verify a sending domain (recast.gg or
--      a subdomain like alerts.recast.gg) — Resend's dashboard shows
--      the DNS TXT/CNAME records to add at your registrar. This is
--      additive to any existing mail (Google Workspace etc.) on that
--      domain — doesn't touch MX/inbound.
--   2. Store the Resend API key in Supabase Vault — run this SEPARATELY
--      in Studio (not part of this file, so the real key never lands
--      in git):
--
--        select vault.create_secret(
--          're_your_real_key_here',
--          'resend_api_key',
--          'Resend API key for notification emails'
--        );
--
--   3. If the "from" address in _send_email() below isn't right for
--      your verified domain, edit it before running this migration.
--
-- VERIFY AFTER RUNNING:
--   select * from cron.job where jobname like '%-daily' or jobname like '%-monday';
--   select _check_overdue_and_notify();   -- manual test, safe to run any time
--   select _weekly_digest_and_notify();   -- manual test, safe to run any time
--   select * from net._http_response order by created desc limit 5;  -- delivery status

create extension if not exists pg_net;

-- ── internal: read the Resend key from Vault ────────────────────────
create or replace function _resend_api_key() returns text
language plpgsql security definer set search_path = public, vault, extensions as $$
declare v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'resend_api_key'
  limit 1;

  if v_key is null then
    raise exception 'resend_api_key not found in Vault — run: select vault.create_secret(''re_xxx'', ''resend_api_key'', ''...'');';
  end if;

  return v_key;
end $$;
revoke all on function _resend_api_key() from public, anon, authenticated;

-- ── internal: fire-and-forget email via Resend ──────────────────────
-- net.http_post is async — it queues the request at COMMIT and
-- returns immediately with a request id. We don't wait for or check
-- the response here (best-effort notification, not a transactional
-- guarantee). Delivery can be audited via net._http_response.
create or replace function _send_email(p_to text[], p_subject text, p_html text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_to is null or array_length(p_to, 1) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _resend_api_key()
    ),
    body := jsonb_build_object(
      -- EDIT this address to match your verified Resend domain.
      'from', 'Recast Dashboard <notifications@recast.gg>',
      'to', to_jsonb(p_to),
      'subject', p_subject,
      'html', p_html
    ),
    timeout_milliseconds := 8000
  );
end $$;
revoke all on function _send_email(text[], text, text) from public, anon, authenticated;

-- ── internal: live-derived overdue rows (not the stored status column
--    — mark_overdue_payments() writes that column on a schedule of
--    uncertain liveness, and it's now vestigial for campaign_payments
--    specifically since that table's status derives live in the UI
--    as of the earlier "auto-derive from receipts" change) ──────────
--
-- p_since_days_overdue / p_until_days_overdue bound how many days
-- past due a row must be. Pass (1, 3) for "just crossed" (daily
-- alert — bounded catch-up window so a missed cron run doesn't lose
-- an alert entirely). Pass (1, null) for "everything currently
-- overdue" (weekly digest count).
create or replace function _overdue_rows(p_since_days_overdue int, p_until_days_overdue int default null)
returns table(source text, who text, amount numeric, days_overdue int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  -- Talent Paying Us: creators owe Recast. Explicit due_date.
  select
    'Talent invoice'::text,
    c.name,
    (ti.amount - ti.amount_paid),
    (current_date - ti.due_date)::int
  from talent_invoices ti
  join creators c on c.id = ti.creator_id
  where ti.amount_paid < ti.amount
    and (current_date - ti.due_date) >= p_since_days_overdue
    and (p_until_days_overdue is null or (current_date - ti.due_date) <= p_until_days_overdue)

  union all

  -- Talent We Pay: Recast owes vendor/contractor. Period-based, EOM due.
  select
    'Vendor payment'::text,
    v.name,
    (vp.amount - vp.amount_paid),
    (current_date - ((make_date(vp.period_year, vp.period_month, 1) + interval '1 month')::date))::int
  from vendor_payments vp
  join vendors v on v.id = vp.vendor_id
  where vp.amount_paid < vp.amount
    and (current_date - ((make_date(vp.period_year, vp.period_month, 1) + interval '1 month')::date)) >= p_since_days_overdue
    and (p_until_days_overdue is null or (current_date - ((make_date(vp.period_year, vp.period_month, 1) + interval '1 month')::date)) <= p_until_days_overdue)

  union all

  -- Vendor invoices: ad-hoc bills. No amount_paid column (0030) —
  -- paid/unpaid is a binary status flip, not receipt-allocated.
  select
    'Vendor invoice'::text,
    v.name || ' — ' || vi.description,
    vi.amount,
    (current_date - vi.due_date)::int
  from vendor_invoices vi
  join vendors v on v.id = vi.vendor_id
  where vi.status <> 'paid'
    and (current_date - vi.due_date) >= p_since_days_overdue
    and (p_until_days_overdue is null or (current_date - vi.due_date) <= p_until_days_overdue);
end $$;
revoke all on function _overdue_rows(int, int) from public, anon, authenticated;

-- ── daily job: alert on newly-overdue payments ──────────────────────
create or replace function _check_overdue_and_notify() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_rows_html text := '';
  v_count int := 0;
  v_recipients text[];
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

  select array_agg(email) into v_recipients from profiles where role in ('admin', 'accounting');

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
end $$;
revoke all on function _check_overdue_and_notify() from public, anon, authenticated;

-- ── weekly job: Monday digest ────────────────────────────────────────
create or replace function _weekly_digest_and_notify() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_receipts_count int;
  v_receipts_total numeric;
  v_overdue_count int;
  v_new_campaigns int;
  v_new_creators int;
  v_recipients text[];
  v_html text;
begin
  select count(*), coalesce(sum(amount), 0) into v_receipts_count, v_receipts_total
  from payment_receipts where received_at >= current_date - 7;

  select count(*) into v_overdue_count from _overdue_rows(1, null);

  select count(*) into v_new_campaigns from campaigns where created_at >= now() - interval '7 days';
  select count(*) into v_new_creators from creators where created_at >= now() - interval '7 days';

  select array_agg(email) into v_recipients from profiles where role in ('admin', 'accounting');
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

  perform _send_email(v_recipients, 'Recast weekly digest', v_html);
end $$;
revoke all on function _weekly_digest_and_notify() from public, anon, authenticated;

-- ── real-time: admin-action security alerts ─────────────────────────
create or replace function _notify_security_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recipients text[];
  v_actor_email text;
  v_target_email text;
begin
  select array_agg(email) into v_recipients from profiles where role = 'admin';
  if v_recipients is null or array_length(v_recipients, 1) = 0 then
    return new;
  end if;

  select email into v_actor_email from profiles where id = new.actor_id;
  if new.payload ? 'target_user_id' then
    select email into v_target_email from profiles where id = (new.payload->>'target_user_id')::uuid;
  end if;

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
  return new;
end $$;

drop trigger if exists trg_notify_security_event on activity_log;
create trigger trg_notify_security_event
  after insert on activity_log
  for each row
  when (new.kind in ('user_created', 'user_deleted', 'user_updated'))
  execute function _notify_security_event();

-- ── real-time: banking vault access alerts (excludes plain 'view' —
--    routine lookups during normal work would make this too noisy;
--    create/update/delete/direct_* are the anomalous ones) ──────────
create or replace function _notify_vault_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_recipients text[];
begin
  select array_agg(email) into v_recipients from profiles where role = 'admin';
  if v_recipients is null or array_length(v_recipients, 1) = 0 then
    return new;
  end if;

  perform _send_email(
    v_recipients,
    format('Vault %s: banking record modified', new.action),
    format(
      '<p><strong>%s</strong> on banking record %s</p><p>By: %s (%s)</p><p>Fields: %s</p>',
      new.action, new.banking_id, coalesce(new.user_email, 'unknown'),
      coalesce(new.user_role::text, 'n/a'), array_to_string(new.fields, ', ')
    )
  );
  return new;
end $$;

drop trigger if exists trg_notify_vault_access on vault_access_log;
create trigger trg_notify_vault_access
  after insert on vault_access_log
  for each row
  when (new.action <> 'view')
  execute function _notify_vault_access();

-- ── schedule the two cron jobs (idempotent — safe to re-run) ────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'overdue-alert-daily') then
    perform cron.unschedule('overdue-alert-daily');
  end if;
end $$;
select cron.schedule('overdue-alert-daily', '0 8 * * *', $$ select _check_overdue_and_notify(); $$);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-digest-monday') then
    perform cron.unschedule('weekly-digest-monday');
  end if;
end $$;
select cron.schedule('weekly-digest-monday', '0 8 * * 1', $$ select _weekly_digest_and_notify(); $$);
