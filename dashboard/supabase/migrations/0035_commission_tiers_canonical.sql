-- 0035_commission_tiers_canonical.sql
-- Round 3 Q1 + Q7 (Gustavo): make commission_tiers the canonical
-- commission column AND introduce a per-creator "legacy cliff math"
-- toggle for grandfathered contracts.
--
-- BACKGROUND
-- ──────────
-- Two columns coexist on creators right now:
--
--   • commission_pct_by_platform  (legacy K-2; live; threshold = "tier
--                                  STARTS at"; values can be flat
--                                  number, null, or tier array)
--   • commission_tiers            (R3 / 0034; unused; threshold = "tier
--                                  ENDS at"; null on last tier =
--                                  "and above")
--
-- Same numerical meaning, different shape. This migration makes
-- commission_tiers the source of truth and translates every legacy
-- row into the new shape so the calc engine can read one column
-- only.
--
-- The cliff toggle (Gustavo Q1) lets existing creators whose contracts
-- were negotiated under cliff stay on cliff. Defaults to FALSE
-- (progressive) — no creator's commission math changes unless Gustavo
-- explicitly flips the toggle per creator.
--
-- ADDITIVE / SAFE
-- ───────────────
-- We add a column + a timestamp + backfill commission_tiers, but we
-- DO NOT drop commission_pct_by_platform yet. The legacy column stays
-- intact as a safety net. Migration 0036 (later, ~2-4 weeks) drops it
-- after verification.
--
-- IDEMPOTENT
-- ──────────
-- Backfill only writes to rows where commission_tiers is currently
-- '{}'::jsonb (the 0034 default). Re-running the migration is safe.


-- ============================================================
-- 1. creators.commission_uses_cliff
-- ============================================================
-- One bool per creator. When TRUE the calc engine reads tiers under
-- cliff semantics (highest tier reached → that pct applies to the
-- entire month). When FALSE (default), progressive math (each tier
-- bills its own slice). Applies across all platforms for the
-- creator — per Gustavo, the contract is one era or the other.

alter table creators
  add column if not exists commission_uses_cliff boolean not null default false;

comment on column creators.commission_uses_cliff is
  'Round 3 Q1: TRUE = legacy cliff math (whole-month-at-one-rate, the K-2 '
  'semantics) for grandfathered contracts. FALSE (default) = progressive '
  '(income-bracket-style slicing). Applies to all platforms; toggle from '
  'the creator profile dialog.';


-- ============================================================
-- 2. creators.commission_tiers_migrated_at
-- ============================================================
-- Timestamp set by the backfill below. Lets us audit which rows the
-- migration touched and reason about cutover state during the
-- transition window. Dropped in 0036 once the legacy column goes.

alter table creators
  add column if not exists commission_tiers_migrated_at timestamptz;

comment on column creators.commission_tiers_migrated_at is
  'Round 3 Q7: timestamp the 0035 backfill populated this row. Audit '
  'trail for the cutover. Dropped in 0036.';


-- ============================================================
-- 3. Backfill: commission_pct_by_platform → commission_tiers
-- ============================================================
-- Per-key transform:
--   • value = null            → omit key from new tiers
--   • value = flat number     → [{ threshold: null, pct: <number> }]
--   • value = tier array      → translate "starts at" → "ends at"
--       legacy [{0,30}, {10000,25}, {50000,20}] becomes
--       new    [{10000,30}, {50000,25}, {null,20}]
--
-- The translation works because every legacy tier's start = next
-- tier's start (or +∞ for the last). Walk the sorted legacy array
-- and emit { threshold: next.start, pct: current.pct } for each
-- position, with the last entry getting threshold:null.
--
-- We do this server-side in plpgsql so the backfill is atomic and
-- can be re-run. The function is dropped at the end.

create or replace function _round3_legacy_to_new_tiers(legacy jsonb)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  result jsonb := '{}'::jsonb;
  key text;
  val jsonb;
  arr jsonb;
  sorted jsonb;
  new_arr jsonb;
  i int;
  n int;
  next_threshold jsonb;
begin
  if legacy is null or jsonb_typeof(legacy) <> 'object' then
    return '{}'::jsonb;
  end if;

  for key, val in select * from jsonb_each(legacy) loop
    -- null value → skip
    if val is null or val = 'null'::jsonb then
      continue;

    -- numeric value (flat pct) → wrap as single tier with threshold:null
    elsif jsonb_typeof(val) = 'number' then
      result := result || jsonb_build_object(
        key,
        jsonb_build_array(jsonb_build_object('threshold', null, 'pct', val))
      );

    -- array of tiers → translate shape
    elsif jsonb_typeof(val) = 'array' then
      -- empty array → skip
      if jsonb_array_length(val) = 0 then
        continue;
      end if;

      -- sort tiers by ascending threshold (defensive; legacy data
      -- might be out of order)
      select jsonb_agg(elem order by (elem->>'threshold')::numeric)
        into sorted
        from jsonb_array_elements(val) elem
        where elem ? 'threshold' and elem ? 'pct';

      if sorted is null or jsonb_array_length(sorted) = 0 then
        continue;
      end if;

      new_arr := '[]'::jsonb;
      n := jsonb_array_length(sorted);
      for i in 0..(n - 1) loop
        -- new threshold = NEXT legacy tier's threshold, or null for
        -- the last position. pct stays with its tier.
        if i = n - 1 then
          next_threshold := 'null'::jsonb;
        else
          next_threshold := (sorted->(i + 1))->'threshold';
        end if;
        new_arr := new_arr || jsonb_build_array(
          jsonb_build_object(
            'threshold', next_threshold,
            'pct',       (sorted->i)->'pct'
          )
        );
      end loop;
      result := result || jsonb_build_object(key, new_arr);
    end if;
    -- everything else (object, bool, string) is ignored — defensive.
  end loop;

  return result;
end;
$$;

-- Apply the backfill only to rows that haven't been migrated yet.
-- commission_tiers = '{}' is the 0034 default; once we write a real
-- value here the row is considered migrated.
update creators
   set commission_tiers              = _round3_legacy_to_new_tiers(commission_pct_by_platform),
       commission_tiers_migrated_at  = now()
 where commission_tiers = '{}'::jsonb
   and commission_pct_by_platform is not null
   and commission_pct_by_platform <> '{}'::jsonb;

-- Clean up the helper.
drop function if exists _round3_legacy_to_new_tiers(jsonb);


-- ============================================================
-- 4. Comment legacy column as deprecated
-- ============================================================
-- Doesn't drop yet; just marks intent. Migration 0036 does the drop
-- once we've verified no surprises in production.

comment on column creators.commission_pct_by_platform is
  'DEPRECATED (Round 3 Q7): superseded by commission_tiers. Read-only '
  'fallback during the cutover window. Dropped in migration 0036.';


-- ============================================================
-- Done. No data loss, no behaviour change until app code reads from
-- the new column.
-- ============================================================
