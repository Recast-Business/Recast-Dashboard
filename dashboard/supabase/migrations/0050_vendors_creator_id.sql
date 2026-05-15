-- 0050_vendors_creator_id.sql
-- Bruno: "Add Talent" on the Talent We Pay grid should pick from the
-- Talent Ledger, not the vendors list. We back that flow by linking a
-- vendor row (kind='talent_we_pay') to a creator, find-or-create on
-- pick. This column makes that link possible + lets us dedupe so
-- picking the same creator twice doesn't spawn parallel vendor rows.

alter table vendors
  add column if not exists creator_id uuid references creators(id) on delete set null;

comment on column vendors.creator_id is
  'When kind=''talent_we_pay'' this points to the underlying Talent '
  'Ledger creator. NULL for vendor-side rows (editors, contractors, '
  'etc) that aren''t on the roster.';

-- One talent_we_pay row per creator. Partial index so non-AO vendors
-- (kind != talent_we_pay) can repeat freely.
create unique index if not exists vendors_creator_talent_we_pay_uniq
  on vendors(creator_id)
  where kind = 'talent_we_pay' and creator_id is not null;
