-- 0029_split_harriet_keenan.sql
-- Harriet and Keenan were seeded as a single resident in 0020 because
-- they share a bedroom. Splitting them so each has their own rent
-- ledger and counts as a separate head for utility splits (which now
-- divide by 6 instead of 5).
--
-- Implementation:
--   1. Rename the existing "Harriet & Keenan" row to "Harriet" with
--      half the original rent. Existing rent payment history (rows in
--      house_rent_payments) follows them via FK.
--   2. Insert "Keenan" as a new resident in the same bedroom with the
--      other half. Starts with no rent payment history — Keenan's
--      back-rent (if any) needs to be entered by hand.
--
-- Idempotent: if no "Harriet & Keenan" row exists (already run, or
-- never seeded), nothing happens.
--
-- If you want a different rent split, edit each row's monthly_rent
-- in the Roster after this runs.

do $$
declare
  v_id uuid;
  v_bedroom text;
  v_half numeric(10,2);
begin
  select id, bedroom, (monthly_rent / 2.0)::numeric(10,2)
    into v_id, v_bedroom, v_half
    from house_residents
   where lower(name) = lower('Harriet & Keenan')
     and active = true
   limit 1;

  if v_id is null then
    raise notice '0029: no "Harriet & Keenan" row found — nothing to split.';
    return;
  end if;

  -- Step 1: rename existing row to Harriet, halve the rent
  update house_residents
     set name = 'Harriet',
         monthly_rent = v_half,
         notes = coalesce(notes || ' · ', '') || 'Split from "Harriet & Keenan" by 0029'
   where id = v_id;

  -- Step 2: insert Keenan as a brand-new resident in the same bedroom
  insert into house_residents (name, bedroom, monthly_rent, notes)
  values ('Keenan', v_bedroom, v_half, 'Split from "Harriet & Keenan" by 0029');
end $$;
