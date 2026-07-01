-- 0053_admin_panel_v2.sql
-- Admin panel v2: visibility into what the panel (and the rest of the
-- app) has been quietly logging all along, plus two small write ops.
--
--   • admin_list_activity     — recent activity_log, actor email joined
--   • admin_list_vault_access — recent vault_access_log (banking audit
--     trail — this table has existed since 0021 with zero UI on it
--     until now)
--   • admin_list_cron_status  — health of the pg_cron jobs (overdue
--     flip from 0028, and the two from 0052 once scheduled) — last
--     run time + status, so a silently-dead job is visible instead
--     of invisible
--   • admin_set_user_full_name — was create-only before; now editable
--   • admin_email_login_details — best-effort "send these credentials
--     by email" as a SEPARATE action from create/reset, so a Resend
--     hiccup never blocks the create/reset itself. Unlike the 0052
--     notification triggers, this one does NOT swallow its own
--     exception — the admin explicitly asked for this specific send,
--     so a failure should surface as a toast, not vanish silently.
--
-- All admin-gated via _admin_require() (from 0051), all audit-logged
-- via _admin_log() where they mutate state.

create or replace function admin_list_activity(p_limit int default 50)
returns table(id bigint, created_at timestamptz, kind activity_kind, actor_email text, payload jsonb)
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_require();
  return query
  select al.id, al.created_at, al.kind, p.email, al.payload
  from activity_log al
  left join profiles p on p.id = al.actor_id
  order by al.created_at desc
  limit greatest(1, least(p_limit, 200));
end $$;
grant execute on function admin_list_activity(int) to authenticated;

create or replace function admin_list_vault_access(p_limit int default 50)
returns table(id bigint, accessed_at timestamptz, action text, user_email text, user_role user_role, banking_id uuid, fields text[])
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_require();
  return query
  select v.id, v.accessed_at, v.action, v.user_email, v.user_role, v.banking_id, v.fields
  from vault_access_log v
  order by v.accessed_at desc
  limit greatest(1, least(p_limit, 200));
end $$;
grant execute on function admin_list_vault_access(int) to authenticated;

create or replace function admin_list_cron_status()
returns table(jobname text, schedule text, active boolean, last_run_at timestamptz, last_status text, last_message text)
language plpgsql security definer set search_path = public, cron as $$
begin
  perform _admin_require();
  return query
  select
    j.jobname, j.schedule, j.active,
    r.start_time, r.status, r.return_message
  from cron.job j
  left join lateral (
    select start_time, status, return_message
    from cron.job_run_details
    where jobid = j.jobid
    order by start_time desc
    limit 1
  ) r on true
  order by j.jobname;
end $$;
grant execute on function admin_list_cron_status() to authenticated;

create or replace function admin_set_user_full_name(p_user_id uuid, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_require();
  update profiles set full_name = nullif(trim(p_full_name), '') where id = p_user_id;
  perform _admin_log('user_updated', p_user_id,
    jsonb_build_object('action', 'name_changed', 'new_name', p_full_name));
end $$;
grant execute on function admin_set_user_full_name(uuid, text) to authenticated;

create or replace function admin_email_login_details(p_user_id uuid, p_temp_password text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  perform _admin_require();
  select email into v_email from profiles where id = p_user_id;
  if v_email is null then raise exception 'user not found'; end if;

  -- Deliberately NOT wrapped in exception-swallowing (unlike the 0052
  -- background triggers) — the admin explicitly requested this send,
  -- so a Resend/Vault failure should surface as an error, not vanish.
  perform _send_email(
    array[v_email],
    'Your Recast Dashboard login',
    format(
      '<p>Email: %s</p><p>Temporary password: <code>%s</code></p>' ||
      '<p>Sign in and consider changing your password afterward.</p>',
      v_email, p_temp_password
    )
  );

  perform _admin_log('user_updated', p_user_id,
    jsonb_build_object('action', 'login_details_emailed'));
end $$;
grant execute on function admin_email_login_details(uuid, text) to authenticated;
