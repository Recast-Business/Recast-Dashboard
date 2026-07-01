-- 0051_admin_user_management.sql
-- Self-serve admin: manage users from the in-app /admin panel without
-- ever touching Supabase Studio.
--
-- SECURITY MODEL
--   • Every public admin_* function is SECURITY DEFINER (runs as the
--     postgres owner, so it can read/write the auth schema) but gates
--     on the CALLER's role via _admin_require(), which reads
--     auth.uid() from the request JWT. A non-admin who calls any of
--     these gets 'forbidden' raised — the grant to `authenticated`
--     is intentional; the in-body check is the real gate (identical
--     to the vault_* banking pattern).
--   • NO service_role key is used or stored anywhere. All elevated
--     access is contained in these audited functions.
--   • Every mutation writes an activity_log row (actor = the admin,
--     target user id + details in the payload) for a full audit trail.
--   • Guard rails: can't strip the last admin, can't delete/deactivate
--     your own account, delete refuses when the user has audit history
--     (use deactivate instead to preserve the trail).

-- ── activity_kind: admin action kinds ───────────────────────────────
-- (Function bodies below reference these literals, but a CREATE
--  FUNCTION doesn't EVALUATE the body, so there's no "can't use a new
--  enum value in the same transaction" problem here.)
alter type activity_kind add value if not exists 'user_created';
alter type activity_kind add value if not exists 'user_deleted';
alter type activity_kind add value if not exists 'user_updated';

-- ── defensive drops ─────────────────────────────────────────────────
-- CREATE OR REPLACE cannot rename a function's parameters (42P13).
-- An earlier hand-run sketch of admin_set_user_role used p_new_role,
-- which blocked this file's first apply. Dropping by signature makes
-- the whole migration idempotent on re-run.
drop function if exists admin_set_user_role(uuid, user_role);
drop function if exists admin_set_user_flag(uuid, text, boolean);
drop function if exists admin_set_user_email(uuid, text);
drop function if exists admin_set_user_password(uuid, text);
drop function if exists admin_set_user_active(uuid, boolean);
drop function if exists admin_delete_user(uuid);
drop function if exists admin_create_user(text, text, user_role, boolean, text);
drop function if exists admin_list_users();

-- ── internal: admin gate ────────────────────────────────────────────
create or replace function _admin_require() returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select role from profiles where id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden: admin role required';
  end if;
end $$;
revoke all on function _admin_require() from public, anon, authenticated;

-- ── internal: audit log helper ──────────────────────────────────────
create or replace function _admin_log(p_kind activity_kind, p_target uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (kind, actor_id, payload)
  values (
    p_kind,
    auth.uid(),
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('target_user_id', p_target)
  );
end $$;
revoke all on function _admin_log(activity_kind, uuid, jsonb) from public, anon, authenticated;

-- ── list users (profiles + auth metadata) ───────────────────────────
-- Note: requires_tax_info lives on creators/vendors (1099 tracking
-- subjects, migration 0039) — NOT on profiles (dashboard accounts).
-- It was mistakenly included here on first pass; removed.
create or replace function admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role user_role,
  view_campaign_financials boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz
)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform _admin_require();
  return query
  select
    p.id, p.email, p.full_name, p.role,
    p.view_campaign_financials, p.created_at,
    u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  from profiles p
  join auth.users u on u.id = p.id
  order by p.created_at;
end $$;
grant execute on function admin_list_users() to authenticated;

-- ── change role (with last-admin lockout guard) ─────────────────────
create or replace function admin_set_user_role(p_user_id uuid, p_role user_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_old user_role;
begin
  perform _admin_require();
  select role into v_old from profiles where id = p_user_id;
  if v_old is null then raise exception 'user not found'; end if;
  if v_old = 'admin' and p_role <> 'admin'
     and (select count(*) from profiles where role = 'admin') <= 1 then
    raise exception 'cannot remove the last admin';
  end if;
  update profiles set role = p_role where id = p_user_id;
  perform _admin_log('user_updated', p_user_id,
    jsonb_build_object('action', 'role_changed', 'old_role', v_old, 'new_role', p_role));
end $$;
grant execute on function admin_set_user_role(uuid, user_role) to authenticated;

-- ── toggle a boolean flag ───────────────────────────────────────────
-- Only view_campaign_financials lives on profiles. requires_tax_info
-- is a creators/vendors concept (1099 subjects), not a dashboard-
-- account flag — dropped from here; manage it from Talent Ledger /
-- Vendors instead.
create or replace function admin_set_user_flag(p_user_id uuid, p_flag text, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_require();
  if p_flag = 'view_campaign_financials' then
    update profiles set view_campaign_financials = p_value where id = p_user_id;
  else
    raise exception 'unknown flag: %', p_flag;
  end if;
  perform _admin_log('user_updated', p_user_id,
    jsonb_build_object('action', 'flag_changed', 'flag', p_flag, 'value', p_value));
end $$;
grant execute on function admin_set_user_flag(uuid, text, boolean) to authenticated;

-- ── change email (auth.users + auth.identities + profiles) ──────────
create or replace function admin_set_user_email(p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old text;
begin
  perform _admin_require();
  if exists (select 1 from auth.users where email = p_email and id <> p_user_id) then
    raise exception 'a different user already uses %', p_email;
  end if;
  select email into v_old from profiles where id = p_user_id;
  update auth.users set email = p_email, updated_at = now() where id = p_user_id;
  update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(p_email))
   where user_id = p_user_id and provider = 'email';
  update profiles set email = p_email where id = p_user_id;
  perform _admin_log('user_updated', p_user_id,
    jsonb_build_object('action', 'email_changed', 'old_email', v_old, 'new_email', p_email));
end $$;
grant execute on function admin_set_user_email(uuid, text) to authenticated;

-- ── reset password ──────────────────────────────────────────────────
create or replace function admin_set_user_password(p_user_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  perform _admin_require();
  if length(p_password) < 8 then raise exception 'password must be at least 8 characters'; end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = p_user_id;
  -- never log the password itself
  perform _admin_log('user_updated', p_user_id, jsonb_build_object('action', 'password_reset'));
end $$;
grant execute on function admin_set_user_password(uuid, text) to authenticated;

-- ── deactivate / reactivate (banned_until toggle) ───────────────────
create or replace function admin_set_user_active(p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform _admin_require();
  if not p_active and p_user_id = auth.uid() then
    raise exception 'cannot deactivate your own account';
  end if;
  update auth.users
     set banned_until = case when p_active then null else 'infinity'::timestamptz end,
         updated_at = now()
   where id = p_user_id;
  perform _admin_log('user_updated', p_user_id,
    jsonb_build_object('action', case when p_active then 'reactivated' else 'deactivated' end));
end $$;
grant execute on function admin_set_user_active(uuid, boolean) to authenticated;

-- ── delete (refuses when the user has audit history) ────────────────
create or replace function admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_email text;
begin
  perform _admin_require();
  if p_user_id = auth.uid() then raise exception 'cannot delete your own account'; end if;
  if exists (select 1 from activity_log where actor_id = p_user_id) then
    raise exception 'user has activity history — deactivate instead of deleting to preserve the audit trail';
  end if;
  select email into v_email from profiles where id = p_user_id;
  if v_email is null then raise exception 'user not found'; end if;
  -- log first (target row about to vanish; actor row is the admin, unaffected)
  perform _admin_log('user_deleted', p_user_id, jsonb_build_object('email', v_email));
  delete from auth.users where id = p_user_id;  -- cascades to profiles
end $$;
grant execute on function admin_delete_user(uuid) to authenticated;

-- ── create user (email + password + role) ───────────────────────────
-- The on_auth_user_created trigger (migration 0001) auto-inserts the
-- profiles row with default role 'partner'; this function then sets
-- the requested role + flags. The auth.users / auth.identities inserts
-- match the current Supabase GoTrue schema.
create or replace function admin_create_user(
  p_email text,
  p_password text,
  p_role user_role,
  p_view_campaign_financials boolean default false,
  p_full_name text default null
)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid := gen_random_uuid();
begin
  perform _admin_require();
  if length(p_password) < 8 then raise exception 'password must be at least 8 characters'; end if;
  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'a user with email % already exists', p_email;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    p_email, v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  -- trigger already created the profiles row; set role + flags + name.
  update profiles
     set role = p_role,
         view_campaign_financials = p_view_campaign_financials,
         full_name = coalesce(p_full_name, full_name)
   where id = v_id;

  perform _admin_log('user_created', v_id,
    jsonb_build_object('email', p_email, 'role', p_role));
  return v_id;
end $$;
grant execute on function admin_create_user(text, text, user_role, boolean, text) to authenticated;
