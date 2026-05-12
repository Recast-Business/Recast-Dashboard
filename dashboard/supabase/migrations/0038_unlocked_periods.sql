-- 0038_unlocked_periods.sql
-- Round 4 A.2 (Gustavo): 6-month auto-lock + per-month admin unlock.
--
-- WHY
-- ───
-- The R3D.2 past-month lock only blocked NEW entries in closed months
-- — edits to existing rows were still allowed. Gustavo wants a
-- stricter rule on old data: anything older than 6 months becomes
-- fully read-only (no new entries AND no edits) unless an admin
-- explicitly unlocks that month. This protects historical accuracy
-- once the books for a period are considered closed.
--
-- The auto-lock threshold (6 months) is enforced in client code via
-- `isMonthRecent`. This migration introduces the persistent admin
-- override: a row in unlocked_periods marks (year, month) as
-- editable again across all grids and all users, until an admin
-- explicitly re-locks it (deletes the row).
--
-- No data backfill — existing rows stay where they are; only future
-- edits are gated by this table.

create table if not exists unlocked_periods (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null,
  month       int  not null check (month >= 1 and month <= 12),
  unlocked_by uuid references profiles(id) on delete set null,
  unlocked_at timestamptz not null default now(),
  note        text,
  unique (year, month)
);

comment on table unlocked_periods is
  'Round 4 A.2: per-(year, month) admin override of the 6-month '
  'auto-lock. Presence of a row = that month is editable for '
  'everyone again. Delete the row to re-lock. RLS allows '
  'admin + finance write; everyone reads (so all grids agree on '
  'which periods are open).';

create index if not exists unlocked_periods_year_idx on unlocked_periods(year);


-- ============================================================
-- RLS
-- ============================================================

alter table unlocked_periods enable row level security;

-- Read: any authenticated user. The lock state needs to be visible
-- to everyone so grids render consistently.
drop policy if exists unlocked_periods_select on unlocked_periods;
create policy unlocked_periods_select
  on unlocked_periods for select
  to authenticated
  using (true);

-- Write: admin + finance only. Partners and operators see the lock
-- state but can't change it.
drop policy if exists unlocked_periods_write on unlocked_periods;
create policy unlocked_periods_write
  on unlocked_periods for all
  to authenticated
  using (
    exists (
      select 1 from profiles
       where profiles.id = auth.uid()
         and profiles.role in ('admin', 'finance')
    )
  )
  with check (
    exists (
      select 1 from profiles
       where profiles.id = auth.uid()
         and profiles.role in ('admin', 'finance')
    )
  );


-- ============================================================
-- Activity log: every unlock/re-lock action
-- ============================================================
-- Add new activity kinds so /activity surfaces who unlocked what
-- and when. Audit trail for the financial mode equivalent.
--
-- IMPORTANT: these ALTER TYPE statements CANNOT run inside a
-- transaction block. The Supabase SQL Editor autocommits each Run
-- separately, so paste each `alter type` statement and Run it on
-- its own, then paste the rest of the migration as a separate Run.
-- The DO block version of this used to fail with "ALTER TYPE ...
-- ADD VALUE cannot run inside a transaction block".

alter type activity_kind add value if not exists 'period_unlocked';
alter type activity_kind add value if not exists 'period_relocked';

create or replace function log_period_unlocked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (kind, actor_id, payload)
  values (
    'period_unlocked',
    auth.uid(),
    jsonb_build_object(
      'year', new.year,
      'month', new.month,
      'note', new.note
    )
  );
  return new;
end $$;

drop trigger if exists trg_period_unlocked on unlocked_periods;
create trigger trg_period_unlocked
  after insert on unlocked_periods
  for each row execute function log_period_unlocked();

create or replace function log_period_relocked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (kind, actor_id, payload)
  values (
    'period_relocked',
    auth.uid(),
    jsonb_build_object('year', old.year, 'month', old.month)
  );
  return old;
end $$;

drop trigger if exists trg_period_relocked on unlocked_periods;
create trigger trg_period_relocked
  after delete on unlocked_periods
  for each row execute function log_period_relocked();
