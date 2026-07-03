-- 0056_tasks_multi_assignee.sql
-- Round 4 (Max): a task can go to multiple people at once, or to the
-- whole team in one action ("assign to everyone"). Replaces the
-- single tasks.assignee_id column with a task_assignees join table
-- + an assign_everyone flag. Requires 0054 + 0055 already applied.
--
-- VERIFY AFTER RUNNING:
--   select * from task_assignees limit 5;
--   select my_open_task_count();               -- run as a signed-in user in Studio's SQL editor won't work (no auth.uid()) — test from the app instead.

create table if not exists task_assignees (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  -- Who added this assignment — lets the realtime "assigned to you"
  -- toast tell a self-assign apart from someone else assigning you,
  -- same reasoning as tasks.created_by for the original single-
  -- assignee toast.
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists task_assignees_user_idx on task_assignees (user_id);

alter table tasks add column if not exists assign_everyone boolean not null default false;

-- Carry forward existing single-assignee data before dropping the column.
insert into task_assignees (task_id, user_id, added_by)
select id, assignee_id, created_by from tasks where assignee_id is not null
on conflict do nothing;

-- The 0054 tasks_update policy and the 0055 trg_task_assigned trigger
-- both reference assignee_id directly — Postgres refuses to drop the
-- column while they still depend on it. Drop them BEFORE the column,
-- then recreate tasks_update (below) without assignee_id.
drop policy if exists tasks_update on tasks;
drop trigger if exists trg_task_assigned on tasks;
drop function if exists _notify_task_assigned();

drop index if exists tasks_assignee_status_idx;
alter table tasks drop column if exists assignee_id;

alter table task_assignees enable row level security;

drop policy if exists task_assignees_read on task_assignees;
create policy task_assignees_read on task_assignees
  for select using (auth.uid() is not null);

-- Anyone who can edit the task (creator, admin, or a current
-- assignee) can change who else is assigned — mirrors tasks_update.
drop policy if exists task_assignees_write on task_assignees;
create policy task_assignees_write on task_assignees
  for all using (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and (
          t.created_by = auth.uid()
          or auth_role() = 'admin'
          or exists (
            select 1 from task_assignees ta
            where ta.task_id = t.id and ta.user_id = auth.uid()
          )
        )
    )
  ) with check (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and (
          t.created_by = auth.uid()
          or auth_role() = 'admin'
          or exists (
            select 1 from task_assignees ta
            where ta.task_id = t.id and ta.user_id = auth.uid()
          )
        )
    )
  );

-- tasks_update: the assignee-based branch now checks task_assignees
-- (and assign_everyone — anyone on a team-wide task can edit it).
-- (old policy already dropped above, before the column drop)
create policy tasks_update on tasks
  for update using (
    auth.uid() = created_by
    or auth_role() = 'admin'
    or tasks.assign_everyone
    or exists (select 1 from task_assignees ta where ta.task_id = tasks.id and ta.user_id = auth.uid())
  ) with check (
    auth.uid() = created_by
    or auth_role() = 'admin'
    or tasks.assign_everyone
    or exists (select 1 from task_assignees ta where ta.task_id = tasks.id and ta.user_id = auth.uid())
  );

-- ── my open task count, for the sidebar badge ───────────────────────
-- Counts tasks I'm personally assigned to OR that are team-wide,
-- open, not done. SECURITY DEFINER + auth.uid() so RLS doesn't need
-- a second round trip from the client.
create or replace function my_open_task_count()
returns int
language sql security definer set search_path = public stable as $$
  select count(distinct t.id)::int
  from tasks t
  left join task_assignees ta on ta.task_id = t.id and ta.user_id = auth.uid()
  where t.status = 'open'
    and (ta.user_id is not null or t.assign_everyone);
$$;
grant execute on function my_open_task_count() to authenticated;

-- ── notifications: replace assignee_id-based trigger ────────────────
-- (old trigger + function already dropped above, before the column drop)

-- Fires per new row in task_assignees — one email per newly added
-- assignee, whether the task was just created with 3 people on it or
-- someone added a 4th later.
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
  return new;
end $$;

drop trigger if exists trg_task_assignee_added on task_assignees;
create trigger trg_task_assignee_added
  after insert on task_assignees
  for each row
  execute function _notify_task_assignee_added();

-- Fires when a task flips to assign_everyone = true — pings the
-- whole team in one email instead of requiring a join-table row per
-- person (and staying correct as the roster changes).
create or replace function _notify_task_everyone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recipients text[];
  v_actor_email text;
begin
  if not new.assign_everyone then return new; end if;
  if tg_op = 'UPDATE' and old.assign_everyone is true then return new; end if;

  select array_agg(email) into v_recipients from profiles where id <> auth.uid();
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
  return new;
end $$;

drop trigger if exists trg_task_everyone on tasks;
create trigger trg_task_everyone
  after insert or update of assign_everyone on tasks
  for each row
  execute function _notify_task_everyone();

-- Comment notifications: recipients are now every current assignee
-- (task_assignees) + the creator, or the whole team when
-- assign_everyone — minus the comment author. Replaces the 0055
-- version, which only knew about the single assignee_id column.
create or replace function _notify_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks%rowtype;
  v_recipients text[];
  v_author_email text;
begin
  select * into v_task from tasks where id = new.task_id;
  if v_task.id is null then return new; end if;

  select email into v_author_email from profiles where id = new.author_id;

  if v_task.assign_everyone then
    select array_agg(distinct p.email) into v_recipients
    from profiles p
    where p.id <> new.author_id;
  else
    select array_agg(distinct p.email) into v_recipients
    from profiles p
    where p.id <> new.author_id
      and (
        p.id = v_task.created_by
        or exists (select 1 from task_assignees ta where ta.task_id = v_task.id and ta.user_id = p.id)
      );
  end if;

  if v_recipients is null or array_length(v_recipients, 1) = 0 then
    return new;
  end if;

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
  return new;
end $$;
-- trigger trg_task_comment already exists (0055) and points at this
-- function name — replacing the body is enough, no re-create needed.

-- Realtime: task_assignees changes need to reach the board live too
-- (multi-assignee toast + row refresh).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'task_assignees'
  ) then
    alter publication supabase_realtime add table task_assignees;
  end if;
end $$;
