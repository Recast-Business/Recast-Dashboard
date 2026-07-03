-- 0058_fix_task_assignees_recursion.sql
-- Fixes: "infinite recursion detected in policy for relation
-- task_assignees" on every insert (including the default
-- self-assign on task creation).
--
-- Cause: the 0056 task_assignees_write policy's USING/WITH CHECK
-- directly queried task_assignees from a policy defined ON
-- task_assignees ("...or exists (select 1 from task_assignees ta
-- where ...)") — Postgres refuses that as a self-referential RLS
-- check. Same class of problem auth_role() already solves for
-- profiles (0006): wrap the self-check in a SECURITY DEFINER
-- function so the inner lookup runs as the function owner (which
-- bypasses RLS by default, since FORCE ROW LEVEL SECURITY was never
-- set on this table) instead of re-entering task_assignees' own
-- policy.
--
-- VERIFY AFTER RUNNING: create a task from the app — should no
-- longer error.

create or replace function _is_task_assignee(p_task_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from task_assignees where task_id = p_task_id and user_id = p_user_id
  )
$$;

drop policy if exists task_assignees_write on task_assignees;
create policy task_assignees_write on task_assignees
  for all using (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and (
          t.created_by = auth.uid()
          or auth_role() = 'admin'
          or _is_task_assignee(t.id, auth.uid())
        )
    )
  ) with check (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and (
          t.created_by = auth.uid()
          or auth_role() = 'admin'
          or _is_task_assignee(t.id, auth.uid())
        )
    )
  );
