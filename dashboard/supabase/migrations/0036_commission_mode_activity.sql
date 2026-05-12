-- 0036_commission_mode_activity.sql
-- Round 3 Q1 follow-up (Gustavo): audit-log trigger for the per-creator
-- legacy cliff toggle. Every time commission_uses_cliff flips on a
-- creator we drop a row into activity_log so the financial mode
-- transition is traceable.
--
-- Additive only. No data change.

-- ============================================================
-- 1. Extend the activity_kind enum
-- ============================================================
-- Postgres enums are append-only via ALTER TYPE ... ADD VALUE.
-- Important: this statement CANNOT run inside a transaction block, so
-- we use the IF NOT EXISTS form directly (pg ≥ 9.6) rather than
-- wrapping in a DO block (which is itself a transaction context and
-- would fail with "ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block"). The IF NOT EXISTS gives idempotent re-run
-- behaviour without the DO wrapper.
--
-- When pasting this migration into the Supabase SQL Editor, run this
-- ALTER TYPE statement on its own (or first), then the trigger block
-- below as a separate Run — Supabase autocommits each Run separately.

alter type activity_kind add value if not exists 'commission_mode_changed';


-- ============================================================
-- 2. Trigger on creators — fire only when commission_uses_cliff
--    actually changes value (uses IS DISTINCT FROM so NULL-flips
--    are handled correctly).
-- ============================================================

create or replace function log_commission_mode_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.commission_uses_cliff is distinct from old.commission_uses_cliff then
    insert into activity_log (kind, actor_id, creator_id, payload)
    values (
      'commission_mode_changed',
      auth.uid(),
      new.id,
      jsonb_build_object(
        'from', case when coalesce(old.commission_uses_cliff, false) then 'cliff' else 'progressive' end,
        'to',   case when coalesce(new.commission_uses_cliff, false) then 'cliff' else 'progressive' end,
        'creator_name', new.name
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_commission_mode_changed on creators;
create trigger trg_commission_mode_changed
  after update on creators
  for each row execute function log_commission_mode_changed();


-- ============================================================
-- Done. Existing rows: no backfill. Future flips logged from now on.
-- ============================================================
