-- 0032_rent_groups.sql
-- Phase M-2: Rent groups — let multiple residents share one rent unit
-- without affecting how utilities split.
--
-- WHY
-- ───
-- Gustavo: "Harriet and Keenan can stay grouped together since they pay
-- rent together. Utilities should stay separated because utilities are
-- split individually."
--
-- 0029 split them into 2 separate residents (good for utilities — they're
-- now 2 heads in the /6 utility split). This migration introduces a
-- rent_group concept so they collapse back into ONE rent row at $1,200,
-- while staying separate for everything else.
--
-- WHAT CHANGES
-- ────────────
-- • New table: rent_groups (id, label, monthly_rent, active, notes)
-- • New column on house_residents: rent_group_id (nullable FK)
-- • New column on house_rent_payments: rent_group_id (NOT NULL after backfill)
-- • house_rent_payments uniqueness flips from
--     (resident_id, year, month)  →  (rent_group_id, year, month)
-- • K-3 reconcile_period_status trigger updated: when a payment receipt
--   targets a resident, it resolves to that resident's rent_group and
--   updates the group's row (so paying "for Keenan" = paying "for H&K").
-- • allocate_fifo updated for the same reason.
--
-- BACKFILL STRATEGY
-- ─────────────────
-- 1. Create one rent_group per current resident, label = name, rent =
--    current monthly_rent. Link the resident to it.
-- 2. Special case: residents named Harriet + Keenan get the SAME group
--    (label "Harriet & Keenan", combined rent).
-- 3. Migrate house_rent_payments.resident_id → rent_group_id.
-- 4. Dedupe: when Harriet's January row + Keenan's January row collapse
--    into the same (group, year, month), merge them — sum amounts +
--    amount_paid, take latest paid_at, pick the strongest status (paid >
--    partial > overdue > unpaid).
--
-- resident_id stays on house_rent_payments (now nullable) for audit only.

-- ============================================================
-- 1. rent_groups table
-- ============================================================

create table rent_groups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  monthly_rent numeric(10,2) not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index rent_groups_active_label_idx
  on rent_groups(lower(label)) where active;

create trigger trg_rent_groups_updated_at before update on rent_groups
  for each row execute function set_updated_at();

comment on table rent_groups is
  'Phase M-2: a unit that pays rent together. Most groups are 1:1 with a resident; H&K share one group.';

-- RLS — admin + finance only, same pattern as house_residents
alter table rent_groups enable row level security;
create policy rent_groups_admin on rent_groups for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy rent_groups_finance on rent_groups for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter publication supabase_realtime add table rent_groups;

-- ============================================================
-- 2. Link house_residents → rent_groups
-- ============================================================

alter table house_residents
  add column if not exists rent_group_id uuid references rent_groups(id) on delete set null;

create index house_residents_rent_group_idx on house_residents(rent_group_id);

-- ============================================================
-- 3. Seed rent_groups + backfill residents
-- ============================================================

do $$
declare
  v_hk_id uuid;
  v_hk_total numeric(10,2);
  v_resident record;
  v_grp uuid;
begin
  -- 3a. H&K combined group (only if both rows exist)
  select coalesce(sum(monthly_rent), 0) into v_hk_total
  from house_residents
  where lower(name) in ('harriet', 'keenan');

  if v_hk_total > 0 and (
    select count(*) from house_residents where lower(name) in ('harriet', 'keenan')
  ) = 2 then
    insert into rent_groups (label, monthly_rent)
    values ('Harriet & Keenan', v_hk_total)
    returning id into v_hk_id;

    update house_residents
    set rent_group_id = v_hk_id
    where lower(name) in ('harriet', 'keenan');

    raise notice '0032: created H&K rent_group (id=%, rent=%)', v_hk_id, v_hk_total;
  end if;

  -- 3b. Everyone else: one group per resident, label = name, rent = current monthly_rent
  for v_resident in
    select id, name, monthly_rent from house_residents where rent_group_id is null
  loop
    insert into rent_groups (label, monthly_rent)
    values (v_resident.name, v_resident.monthly_rent)
    returning id into v_grp;

    update house_residents set rent_group_id = v_grp where id = v_resident.id;
  end loop;
end $$;

-- ============================================================
-- 4. Migrate house_rent_payments
-- ============================================================

alter table house_rent_payments
  add column if not exists rent_group_id uuid references rent_groups(id) on delete cascade;

-- Backfill rent_group_id from each row's resident → group
update house_rent_payments hrp
set rent_group_id = hr.rent_group_id
from house_residents hr
where hrp.resident_id = hr.id
  and hrp.rent_group_id is null;

-- 4a. Dedupe collisions
-- When Harriet+Keenan both have a row for (year, month), they'll now share
-- the same rent_group_id. We need to collapse them into one.
do $$
declare
  v_dup record;
  v_keep_id uuid;
begin
  -- For every (rent_group_id, year, month) with > 1 row, merge into the
  -- earliest (created_at) row and delete the rest.
  for v_dup in
    select rent_group_id, period_year, period_month
      from house_rent_payments
     where rent_group_id is not null
     group by rent_group_id, period_year, period_month
    having count(*) > 1
  loop
    -- Pick the row to keep (oldest by created_at, then id for stability)
    select id into v_keep_id
      from house_rent_payments
     where rent_group_id = v_dup.rent_group_id
       and period_year = v_dup.period_year
       and period_month = v_dup.period_month
     order by created_at asc, id asc
     limit 1;

    -- Aggregate the duplicates into the keeper
    update house_rent_payments hrp
       set
        amount = (
          select sum(amount)
            from house_rent_payments hrp2
           where hrp2.rent_group_id = v_dup.rent_group_id
             and hrp2.period_year = v_dup.period_year
             and hrp2.period_month = v_dup.period_month
        ),
        amount_paid = (
          select sum(amount_paid)
            from house_rent_payments hrp2
           where hrp2.rent_group_id = v_dup.rent_group_id
             and hrp2.period_year = v_dup.period_year
             and hrp2.period_month = v_dup.period_month
        ),
        paid_at = (
          select max(paid_at)
            from house_rent_payments hrp2
           where hrp2.rent_group_id = v_dup.rent_group_id
             and hrp2.period_year = v_dup.period_year
             and hrp2.period_month = v_dup.period_month
        ),
        status = (
          -- Status precedence: paid > partial > overdue > unpaid
          select case
                   when bool_or(status = 'paid') and bool_and(status = 'paid') then 'paid'::payment_status
                   when bool_or(status = 'paid') or bool_or(status = 'partial') then 'partial'::payment_status
                   when bool_or(status = 'overdue') then 'overdue'::payment_status
                   else 'unpaid'::payment_status
                 end
            from house_rent_payments hrp2
           where hrp2.rent_group_id = v_dup.rent_group_id
             and hrp2.period_year = v_dup.period_year
             and hrp2.period_month = v_dup.period_month
        )
     where hrp.id = v_keep_id;

    -- Delete the duplicates
    delete from house_rent_payments
     where rent_group_id = v_dup.rent_group_id
       and period_year = v_dup.period_year
       and period_month = v_dup.period_month
       and id <> v_keep_id;
  end loop;
end $$;

-- 4b. Lock down the new key
alter table house_rent_payments alter column rent_group_id set not null;

-- Drop the old (resident_id, year, month) unique
alter table house_rent_payments
  drop constraint if exists house_rent_payments_resident_id_period_year_period_month_key;

-- New uniqueness on (rent_group_id, year, month)
create unique index if not exists house_rent_payments_group_period_idx
  on house_rent_payments(rent_group_id, period_year, period_month);

-- resident_id stays nullable for audit / debugging
alter table house_rent_payments alter column resident_id drop not null;

comment on column house_rent_payments.resident_id is
  'Pre-M-2: was the primary key dimension. Now legacy / audit only — rent_group_id is authoritative.';
comment on column house_rent_payments.rent_group_id is
  'Phase M-2: the rent unit this row settles. One row per (rent_group_id, year, month).';

-- ============================================================
-- 5. Update K-3 reconcile_period_status for rent_groups
-- ============================================================
-- When a receipt comes in for resident X, we resolve X → rent_group and
-- update that group's row. Sum allocations across ALL receipts pointing at
-- ANY resident in the group (so paying for Harriet AND Keenan both apply
-- to the same H&K rent row).

create or replace function reconcile_period_status() returns trigger
language plpgsql as $$
declare
  rec record;
  total_paid numeric(12,2);
  amount_owed numeric(12,2);
  new_status payment_status;
  changed_year int;
  changed_month int;
  changed_receipt uuid;
  v_rent_group_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_year    := old.period_year;
    changed_month   := old.period_month;
    changed_receipt := old.receipt_id;
  else
    changed_year    := new.period_year;
    changed_month   := new.period_month;
    changed_receipt := new.receipt_id;
  end if;

  select * into rec from payment_receipts where id = changed_receipt;
  if not found then
    return coalesce(new, old);
  end if;

  case rec.source
    when 'vendor' then
      select coalesce(sum(pa.amount), 0) into total_paid
        from payment_allocations pa
        join payment_receipts pr on pr.id = pa.receipt_id
       where pr.source = 'vendor'
         and pr.vendor_id = rec.vendor_id
         and pa.period_year  = changed_year
         and pa.period_month = changed_month;
      select coalesce(amount, 0) into amount_owed
        from vendor_payments
       where vendor_id = rec.vendor_id
         and period_year  = changed_year
         and period_month = changed_month;
      new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
      update vendor_payments
         set amount_paid = total_paid,
             status      = new_status,
             paid_at     = case when new_status = 'paid' then coalesce(paid_at, current_date) else paid_at end
       where vendor_id = rec.vendor_id
         and period_year  = changed_year
         and period_month = changed_month;

    when 'campaign' then
      select coalesce(sum(pa.amount), 0) into total_paid
        from payment_allocations pa
        join payment_receipts pr on pr.id = pa.receipt_id
       where pr.source = 'campaign'
         and pr.campaign_creator_id = rec.campaign_creator_id
         and pa.period_year  = changed_year
         and pa.period_month = changed_month;
      select coalesce(cached_commission, 0) into amount_owed
        from campaign_creators
       where id = rec.campaign_creator_id;
      new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
      insert into campaign_payments(campaign_creator_id, period_year, period_month, amount_paid, status)
        values (rec.campaign_creator_id, changed_year, changed_month, total_paid, new_status)
        on conflict (campaign_creator_id, period_year, period_month)
        do update set amount_paid = excluded.amount_paid,
                      status      = excluded.status,
                      paid_at     = case when excluded.status = 'paid'
                                         then coalesce(campaign_payments.paid_at, current_date)
                                         else campaign_payments.paid_at end;

    when 'telegram' then
      select coalesce(sum(pa.amount), 0) into total_paid
        from payment_allocations pa
        join payment_receipts pr on pr.id = pa.receipt_id
       where pr.source = 'telegram'
         and pr.creator_id = rec.creator_id
         and pa.period_year  = changed_year
         and pa.period_month = changed_month;
      select coalesce(recast_commission, 0) into amount_owed
        from tele_period_performance
       where creator_id   = rec.creator_id
         and period_year  = changed_year
         and period_month = changed_month;
      new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
      update tele_period_performance
         set amount_paid = total_paid,
             status      = new_status,
             paid_at     = case when new_status = 'paid' then coalesce(paid_at, current_date) else paid_at end
       where creator_id   = rec.creator_id
         and period_year  = changed_year
         and period_month = changed_month;

    when 'onlyfans' then
      select coalesce(sum(pa.amount), 0) into total_paid
        from payment_allocations pa
        join payment_receipts pr on pr.id = pa.receipt_id
       where pr.source = 'onlyfans'
         and pr.of_deal_id = rec.of_deal_id
         and pa.period_year  = changed_year
         and pa.period_month = changed_month;
      select coalesce(recast_commission, 0) into amount_owed
        from of_period_performance
       where of_deal_id   = rec.of_deal_id
         and period_year  = changed_year
         and period_month = changed_month;
      new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
      update of_period_performance
         set amount_paid = total_paid,
             status      = new_status,
             paid_at     = case when new_status = 'paid' then coalesce(paid_at, current_date) else paid_at end
       where of_deal_id   = rec.of_deal_id
         and period_year  = changed_year
         and period_month = changed_month;

    when 'house_rent' then
      -- Phase M-2: resolve resident → rent_group, then aggregate across the group
      select rent_group_id into v_rent_group_id
        from house_residents
       where id = rec.resident_id;

      if v_rent_group_id is not null then
        select coalesce(sum(pa.amount), 0) into total_paid
          from payment_allocations pa
          join payment_receipts pr on pr.id = pa.receipt_id
          join house_residents hr on hr.id = pr.resident_id
         where pr.source = 'house_rent'
           and hr.rent_group_id = v_rent_group_id
           and pa.period_year  = changed_year
           and pa.period_month = changed_month;
        select coalesce(amount, 0) into amount_owed
          from house_rent_payments
         where rent_group_id = v_rent_group_id
           and period_year  = changed_year
           and period_month = changed_month;
        new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
        update house_rent_payments
           set amount_paid = total_paid,
               status      = new_status,
               paid_at     = case when new_status = 'paid' then coalesce(paid_at, current_date) else paid_at end
         where rent_group_id = v_rent_group_id
           and period_year  = changed_year
           and period_month = changed_month;
      end if;

    when 'house_utility' then
      select coalesce(sum(pa.amount), 0) into total_paid
        from payment_allocations pa
        join payment_receipts pr on pr.id = pa.receipt_id
       where pr.source = 'house_utility'
         and pr.utility_id = rec.utility_id
         and pa.period_year  = changed_year
         and pa.period_month = changed_month;
      select coalesce(amount, 0) into amount_owed
        from house_utility_payments
       where utility_id   = rec.utility_id
         and period_year  = changed_year
         and period_month = changed_month;
      new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
      update house_utility_payments
         set amount_paid = total_paid,
             status      = new_status,
             paid_at     = case when new_status = 'paid' then coalesce(paid_at, current_date) else paid_at end
       where utility_id   = rec.utility_id
         and period_year  = changed_year
         and period_month = changed_month;
  end case;

  return coalesce(new, old);
end $$;

-- ============================================================
-- 6. Update allocate_fifo for rent_groups
-- ============================================================
-- The house_rent branch needs to walk the GROUP's unpaid months, not
-- just the receipt's resident's months.

create or replace function allocate_fifo(p_receipt_id uuid)
returns void
language plpgsql as $$
declare
  rec record;
  remaining numeric(12,2);
  period record;
  per_remaining numeric(12,2);
  to_allocate numeric(12,2);
  q text;
begin
  select * into rec from payment_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt % not found', p_receipt_id;
  end if;

  remaining := rec.amount - coalesce(
    (select sum(amount) from payment_allocations where receipt_id = p_receipt_id),
    0
  );
  if remaining <= 0 then return; end if;

  q := case rec.source
    when 'vendor' then format($q$
      select period_year, period_month,
             coalesce(amount, 0) as owed,
             coalesce(amount_paid, 0) as paid
        from vendor_payments
       where vendor_id = %L
         and status in ('unpaid','partial','overdue')
       order by period_year, period_month$q$, rec.vendor_id)
    when 'telegram' then format($q$
      select period_year, period_month,
             coalesce(recast_commission, 0) as owed,
             coalesce(amount_paid, 0) as paid
        from tele_period_performance
       where creator_id = %L
         and status in ('unpaid','partial','overdue')
       order by period_year, period_month$q$, rec.creator_id)
    when 'onlyfans' then format($q$
      select period_year, period_month,
             coalesce(recast_commission, 0) as owed,
             coalesce(amount_paid, 0) as paid
        from of_period_performance
       where of_deal_id = %L
         and status in ('unpaid','partial','overdue')
       order by period_year, period_month$q$, rec.of_deal_id)
    when 'house_rent' then format($q$
      -- M-2: walk the rent_group's months, not the resident's
      select hrp.period_year, hrp.period_month,
             coalesce(hrp.amount, 0) as owed,
             coalesce(hrp.amount_paid, 0) as paid
        from house_rent_payments hrp
        join house_residents hr on hr.rent_group_id = hrp.rent_group_id
       where hr.id = %L
         and hrp.status in ('unpaid','partial','overdue')
       order by hrp.period_year, hrp.period_month$q$, rec.resident_id)
    when 'house_utility' then format($q$
      select period_year, period_month,
             coalesce(amount, 0) as owed,
             coalesce(amount_paid, 0) as paid
        from house_utility_payments
       where utility_id = %L
         and status in ('unpaid','partial','overdue')
       order by period_year, period_month$q$, rec.utility_id)
    when 'campaign' then format($q$
      with owed as (
        select coalesce(cached_commission, 0) o from campaign_creators where id = %L
      )
      select period_year, period_month,
             (select o from owed) as owed,
             coalesce(amount_paid, 0) as paid
        from campaign_payments
       where campaign_creator_id = %L
         and status in ('unpaid','partial','overdue')
       order by period_year, period_month$q$, rec.campaign_creator_id, rec.campaign_creator_id)
  end;

  for period in execute q loop
    if remaining <= 0 then exit; end if;
    per_remaining := period.owed - period.paid;
    if per_remaining <= 0 then continue; end if;
    to_allocate := least(per_remaining, remaining);
    insert into payment_allocations(receipt_id, period_year, period_month, amount)
      values (p_receipt_id, period.period_year, period.period_month, to_allocate);
    remaining := remaining - to_allocate;
  end loop;
end $$;

-- ============================================================
-- 7. Verify
-- ============================================================
-- After this migration:
--   • select label, monthly_rent from rent_groups order by label;
--     → "Charlotte $1950", "Frazier $1950", "Harriet & Keenan $1200",
--       "Nikan $1200", "Teeqo $1200" (5 rows)
--   • select count(*) from house_residents where rent_group_id is null;
--     → 0
--   • select label, count(*) as residents from rent_groups rg
--       join house_residents hr on hr.rent_group_id = rg.id
--       group by label order by label;
--     → "Charlotte 1", "Frazier 1", "Harriet & Keenan 2", "Nikan 1", "Teeqo 1"
