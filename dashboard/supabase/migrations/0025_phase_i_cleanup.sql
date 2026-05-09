-- Phase I — small data cleanups from Gustavo's feedback round.
--
-- 1. Split the seeded "Harriet & Keenan" combined resident into two
--    separate records so they each count as one head in utility splits.
--    Defaults rent to $600 each (was $1200 combined). Adjust via the UI.
--    Guarded so it only runs if no rent payment history exists for the
--    combined record — otherwise we'd lose history.
--
-- 2. Migrate any existing credit_card_account vendors to kind='vendor'
--    so they show up under the unified Vendors tab. The Credit Cards
--    top-level tab is being dropped per Gustavo's request — credit cards
--    are just regular vendors now.

begin;

-- 1. Harriet & Keenan split
do $$
declare
  v_combined_id uuid;
  v_has_payments boolean;
begin
  select id into v_combined_id from house_residents
  where lower(name) = 'harriet & keenan';

  if v_combined_id is null then
    raise notice 'No combined Harriet & Keenan record — already split or never seeded.';
    return;
  end if;

  select exists(select 1 from house_rent_payments where resident_id = v_combined_id)
    into v_has_payments;

  if v_has_payments then
    raise notice 'Combined record has payment history — manual split required to preserve audit trail.';
    return;
  end if;

  delete from house_residents where id = v_combined_id;

  insert into house_residents (name, bedroom, monthly_rent, active)
  values
    ('Harriet', 'Bedroom 1', 600, true),
    ('Keenan',  'Bedroom 1', 600, true)
  on conflict do nothing;
end $$;

-- 2. Credit card account vendors → unified vendor kind
update vendors
set kind = 'vendor'
where kind = 'credit_card_account';

commit;
