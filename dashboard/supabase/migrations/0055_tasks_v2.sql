-- 0055_tasks_v2.sql
-- Tasks v2 (Max: "proper task manager like firms with massive teams
-- use"). Requires 0054 (tasks table) — run that first if you haven't.
--
--   1. priority column — low | medium | high | urgent, default medium.
--   2. task_comments — a discussion thread per task. Read = any
--      signed-in role; write = any signed-in role (author = self);
--      delete = author or admin.
--   3. Assignment email notifications — trigger fires when a task is
--      created-with or reassigned-to an assignee who isn't the actor,
--      and emails them via the 0052 _send_email pipeline. Exception-
--      safe like every 0052 send: if Resend isn't configured yet the
--      task operation still succeeds and the email is silently
--      skipped (warning in the DB log only). Same for comments —
--      commenting emails the task's assignee + creator (minus the
--      comment author).
--   4. Realtime — tasks + task_comments join the supabase_realtime
--      publication so every open dashboard live-updates the board
--      (and the app toasts you when something lands on your plate).
--
-- VERIFY AFTER RUNNING:
--   select priority from tasks limit 1;
--   select * from task_comments limit 1;
--   select tgname from pg_trigger where tgname like 'trg_task%';

-- ── 1. priority ──────────────────────────────────────────────────────
alter table tasks
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent'));

create index if not exists tasks_priority_idx on tasks (status, priority);

-- ── 2. comments ──────────────────────────────────────────────────────
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on task_comments (task_id, created_at);

alter table task_comments enable row level security;

drop policy if exists task_comments_read on task_comments;
create policy task_comments_read on task_comments
  for select using (auth.uid() is not null);

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments
  for insert with check (auth.uid() is not null and author_id = auth.uid());

drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments
  for delete using (auth.uid() = author_id or auth_role() = 'admin');

-- ── 3a. email on assignment ──────────────────────────────────────────
create or replace function _notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_assignee_email text;
  v_actor_email text;
begin
  -- Only when there IS an assignee, it actually changed (or the task
  -- is new), and they didn't assign it to themselves.
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then
    return new;
  end if;
  if new.assignee_id = auth.uid() then return new; end if;

  select email into v_assignee_email from profiles where id = new.assignee_id;
  select email into v_actor_email from profiles where id = auth.uid();
  if v_assignee_email is null then return new; end if;

  -- Best-effort, same contract as every 0052 trigger: a Resend/Vault
  -- hiccup must never fail the task write itself.
  begin
    perform _send_email(
      array[v_assignee_email],
      format('Task assigned to you: %s', new.title),
      format(
        '<p><strong>%s</strong></p>%s%s%s<p>Assigned by %s. Open the Tasks board to view it.</p>',
        new.title,
        case when new.notes is not null then format('<p>%s</p>', new.notes) else '' end,
        case when new.due_date is not null then format('<p>Due: %s</p>', to_char(new.due_date, 'FMMonth DD, YYYY')) else '' end,
        case when new.entity_label is not null then format('<p>Linked to: %s</p>', new.entity_label) else '' end,
        coalesce(v_actor_email, 'a teammate')
      )
    );
  exception when others then
    raise warning 'task-assignment email failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_task_assigned on tasks;
create trigger trg_task_assigned
  after insert or update of assignee_id on tasks
  for each row
  execute function _notify_task_assigned();

-- ── 3b. email on comment ─────────────────────────────────────────────
-- Recipients: the task's assignee + creator, minus whoever wrote the
-- comment. Keeps the thread moving without anyone polling the board.
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

  select array_agg(distinct p.email) into v_recipients
  from profiles p
  where p.id in (v_task.assignee_id, v_task.created_by)
    and p.id is not null
    and p.id <> new.author_id;

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

drop trigger if exists trg_task_comment on task_comments;
create trigger trg_task_comment
  after insert on task_comments
  for each row
  execute function _notify_task_comment();

-- ── 4. realtime ──────────────────────────────────────────────────────
-- Idempotent-ish guard: adding a table twice to a publication errors,
-- so check membership first.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table task_comments;
  end if;
end $$;
