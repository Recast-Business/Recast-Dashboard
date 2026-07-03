-- 0054_tasks.sql
-- Round 3: shared team task list.
--
-- The friction audit found zero follow-up tracking anywhere in the
-- app — overdue info was "discovery only, no action attached", and
-- chase-ups lived in people's heads / WhatsApp. This adds a
-- lightweight tasks table:
--
--   • title / notes / due_date / status (open|done)
--   • assignee (any dashboard user)
--   • optional link to a campaign, creator, or vendor — stored as
--     (entity_type, entity_id, entity_label). The label is
--     denormalized on purpose: the task list renders without joins,
--     and a task outlives its entity (deleted campaign → task keeps
--     its text label, link just stops resolving).
--
-- VISIBILITY MODEL (deliberate, simple, 5-person team):
--   • every signed-in role sees ALL tasks — it's a shared team
--     board, not private todos. Coordination beats secrecy at this
--     team size.
--   • anyone can create; a task can be edited/completed by its
--     assignee, its creator, or an admin; deleted by its creator
--     or an admin.
--
-- ASSIGNEE NAMES: profiles RLS stays locked down (self-read +
-- admin-only) — instead of widening it, list_team_members() below
-- is a SECURITY DEFINER RPC that returns just id/email/full_name
-- for the assignee dropdown + name display. This also keeps the
-- rls_smoke_test.sql invariant ("non-admins see exactly 1 profiles
-- row") intact.
--
-- VERIFY AFTER RUNNING:
--   select * from tasks limit 1;                -- table exists
--   select * from list_team_members();          -- returns all users

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  notes text,
  status text not null default 'open' check (status in ('open', 'done')),
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  entity_type text check (entity_type in ('campaign', 'creator', 'vendor')),
  entity_id uuid,
  entity_label text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists tasks_assignee_status_idx on tasks (assignee_id, status);
create index if not exists tasks_status_due_idx on tasks (status, due_date);
create index if not exists tasks_entity_idx on tasks (entity_type, entity_id);

alter table tasks enable row level security;

drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks
  for select using (auth.uid() is not null);

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks
  for insert with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks
  for update using (
    auth.uid() = assignee_id or auth.uid() = created_by or auth_role() = 'admin'
  ) with check (
    auth.uid() = assignee_id or auth.uid() = created_by or auth_role() = 'admin'
  );

drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks
  for delete using (auth.uid() = created_by or auth_role() = 'admin');

-- ── team member list for the assignee dropdown ──────────────────────
-- SECURITY DEFINER so any signed-in role can resolve teammates'
-- names without widening profiles RLS. Deliberately excludes role /
-- flags — just enough for "assign to" + name display.
create or replace function list_team_members()
returns table (id uuid, email text, full_name text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  return query
  select p.id, p.email, p.full_name
  from profiles p
  order by p.email;
end $$;
grant execute on function list_team_members() to authenticated;
