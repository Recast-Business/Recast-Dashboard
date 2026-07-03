-- 0057_web_push.sql
-- Round 4 (Max): real OS-level push notifications ("like a Telegram
-- desktop notification") for task assignments/comments, on top of
-- the existing email notifications. Resend can't do this — it's
-- email-only — so this uses the browser's native Web Push API
-- instead: a service worker (dashboard/public/sw.js) + a
-- push_subscriptions table here + a Supabase Edge Function
-- (supabase/functions/send-push) that does the actual encrypted
-- push send, since that requires crypto (ECDH/AES-GCM) that isn't
-- practical in plain SQL/pg_net. Postgres triggers call the Edge
-- Function over HTTP via pg_net, same pattern as _send_email.
--
-- SETUP REQUIRED (separate from this file — see chat for the exact
-- commands, already run once this session):
--   1. Edge Function `send-push` deployed.
--   2. Edge Function secrets set: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--      VAPID_SUBJECT, PUSH_FUNCTION_SECRET.
--   3. Same PUSH_FUNCTION_SECRET value stored in Vault here:
--        select vault.create_secret('<the secret>', 'push_function_secret', 'Shared secret for the send-push Edge Function');
--   4. VITE_VAPID_PUBLIC_KEY set in the dashboard's env (.env.local +
--      Vercel) to the SAME public key given to the Edge Function.
--
-- VERIFY AFTER RUNNING:
--   select * from push_subscriptions limit 5;   -- empty until someone opts in from the app

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── internal: shared secret the Edge Function checks on every call,
--    so the (publicly reachable) function URL can't be used to spam
--    arbitrary push messages by someone outside Postgres ──────────
create or replace function _push_function_secret() returns text
language plpgsql security definer set search_path = public, vault, extensions as $$
declare v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'push_function_secret'
  limit 1;

  if v_key is null then
    raise exception 'push_function_secret not found in Vault — run: select vault.create_secret(''...'', ''push_function_secret'', ''...'');';
  end if;

  return v_key;
end $$;
revoke all on function _push_function_secret() from public, anon, authenticated;

-- ── internal: fire-and-forget push via the send-push Edge Function ──
-- EDIT the project ref in the URL below if this ever moves projects.
create or replace function _send_push(p_user_ids uuid[], p_title text, p_body text, p_url text default '/tasks')
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_user_ids is null or array_length(p_user_ids, 1) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://meobtbqoklldvloqichy.functions.supabase.co/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', _push_function_secret()
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(p_user_ids),
      'title', p_title,
      'body', p_body,
      'url', p_url
    ),
    timeout_milliseconds := 8000
  );
end $$;
revoke all on function _send_push(uuid[], text, text, text) from public, anon, authenticated;

-- ── wire push into the existing task notification triggers ─────────
-- Each push call gets its own exception block, same as the email
-- call right above it in each function — a push failure (no
-- subscription, expired token, Edge Function hiccup) must never
-- block the email or the underlying task write.

create or replace function _notify_task_assignee_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks%rowtype;
  v_assignee_email text;
  v_actor_email text;
begin
  if new.user_id = auth.uid() then return new; end if; -- self-assign, no ping

  select * into v_task from tasks where id = new.task_id;
  if v_task.id is null then return new; end if;

  select email into v_assignee_email from profiles where id = new.user_id;
  select email into v_actor_email from profiles where id = auth.uid();
  if v_assignee_email is null then return new; end if;

  begin
    perform _send_email(
      array[v_assignee_email],
      format('Task assigned to you: %s', v_task.title),
      format(
        '<p><strong>%s</strong></p>%s%s%s<p>Assigned by %s. Open the Tasks board to view it.</p>',
        v_task.title,
        case when v_task.notes is not null then format('<p>%s</p>', v_task.notes) else '' end,
        case when v_task.due_date is not null then format('<p>Due: %s</p>', to_char(v_task.due_date, 'FMMonth DD, YYYY')) else '' end,
        case when v_task.entity_label is not null then format('<p>Linked to: %s</p>', v_task.entity_label) else '' end,
        coalesce(v_actor_email, 'a teammate')
      )
    );
  exception when others then
    raise warning 'task-assignment email failed: %', sqlerrm;
  end;

  begin
    perform _send_push(
      array[new.user_id],
      'Task assigned to you',
      v_task.title,
      '/tasks'
    );
  exception when others then
    raise warning 'task-assignment push failed: %', sqlerrm;
  end;

  return new;
end $$;

create or replace function _notify_task_everyone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recipients text[];
  v_recipient_ids uuid[];
  v_actor_email text;
begin
  if not new.assign_everyone then return new; end if;
  if tg_op = 'UPDATE' and old.assign_everyone is true then return new; end if;

  select array_agg(email), array_agg(id) into v_recipients, v_recipient_ids
  from profiles where id <> auth.uid();
  select email into v_actor_email from profiles where id = auth.uid();
  if v_recipients is null or array_length(v_recipients, 1) = 0 then return new; end if;

  begin
    perform _send_email(
      v_recipients,
      format('Team task: %s', new.title),
      format(
        '<p><strong>%s</strong></p>%s%s<p>Assigned to the whole team by %s.</p>',
        new.title,
        case when new.notes is not null then format('<p>%s</p>', new.notes) else '' end,
        case when new.due_date is not null then format('<p>Due: %s</p>', to_char(new.due_date, 'FMMonth DD, YYYY')) else '' end,
        coalesce(v_actor_email, 'a teammate')
      )
    );
  exception when others then
    raise warning 'team-task email failed: %', sqlerrm;
  end;

  begin
    perform _send_push(v_recipient_ids, 'New team task', new.title, '/tasks');
  exception when others then
    raise warning 'team-task push failed: %', sqlerrm;
  end;

  return new;
end $$;

create or replace function _notify_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks%rowtype;
  v_recipients text[];
  v_recipient_ids uuid[];
  v_author_email text;
begin
  select * into v_task from tasks where id = new.task_id;
  if v_task.id is null then return new; end if;

  select email into v_author_email from profiles where id = new.author_id;

  if v_task.assign_everyone then
    select array_agg(distinct p.email), array_agg(distinct p.id) into v_recipients, v_recipient_ids
    from profiles p
    where p.id <> new.author_id;
  else
    select array_agg(distinct p.email), array_agg(distinct p.id) into v_recipients, v_recipient_ids
    from profiles p
    where p.id <> new.author_id
      and (
        p.id = v_task.created_by
        or exists (select 1 from task_assignees ta where ta.task_id = v_task.id and ta.user_id = p.id)
      );
  end if;

  if v_recipients is not null and array_length(v_recipients, 1) > 0 then
    begin
      perform _send_email(
        v_recipients,
        format('New comment on: %s', v_task.title),
        format(
          '<p><strong>%s</strong> commented on <strong>%s</strong>:</p><blockquote>%s</blockquote>',
          coalesce(v_author_email, 'A teammate'), v_task.title, new.body
        )
      );
    exception when others then
      raise warning 'task-comment email failed: %', sqlerrm;
    end;

    begin
      perform _send_push(
        v_recipient_ids,
        format('%s commented', coalesce(v_author_email, 'A teammate')),
        new.body,
        '/tasks'
      );
    exception when others then
      raise warning 'task-comment push failed: %', sqlerrm;
    end;
  end if;

  return new;
end $$;
