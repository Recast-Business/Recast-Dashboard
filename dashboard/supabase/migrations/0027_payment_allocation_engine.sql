-- 0027_payment_allocation_engine.sql
-- Phase K-3a: payment receipts + allocations + FIFO/specific RPCs.
--
-- Replaces the scattered "paid_at + status" model with a real ledger:
--   • payment_receipts:    every chunk of money received/paid, with date + amount
--   • payment_allocations: how each receipt lands across monthly bills
--   • Triggers:            keep per-period amount_paid + status in sync
--
-- Sources covered:
--   vendor / campaign / telegram / onlyfans / house_rent / house_utility
--
-- Each existing period table gets an amount_paid column that the allocation
-- trigger writes to. Status is derived from amount_paid vs amount_owed.

-- ============================================================
-- 1. Enum
-- ============================================================

create type payment_source as enum (
  'vendor',
  'campaign',
  'telegram',
  'onlyfans',
  'house_rent',
  'house_utility'
);

-- ============================================================
-- 2. amount_paid columns on every period table
-- ============================================================

alter table vendor_payments          add column if not exists amount_paid numeric(12,2) not null default 0;
alter table campaign_payments        add column if not exists amount_paid numeric(12,2) not null default 0;
alter table tele_period_performance  add column if not exists amount_paid numeric(12,2) not null default 0;
alter table of_period_performance    add column if not exists amount_paid numeric(12,2) not null default 0;
alter table house_rent_payments      add column if not exists amount_paid numeric(12,2) not null default 0;
alter table house_utility_payments   add column if not exists amount_paid numeric(12,2) not null default 0;

-- ============================================================
-- 3. payment_receipts (polymorphic obligor)
-- ============================================================

create table payment_receipts (
  id uuid primary key default gen_random_uuid(),
  source payment_source not null,
  -- Exactly one of these must be populated, matching `source`.
  vendor_id uuid references vendors(id) on delete cascade,
  campaign_creator_id uuid references campaign_creators(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,           -- telegram
  of_deal_id uuid references of_deals(id) on delete cascade,
  resident_id uuid references house_residents(id) on delete cascade,
  utility_id uuid references house_utilities(id) on delete cascade,
  received_at date not null,                                            -- when the money actually moved
  amount numeric(12,2) not null check (amount > 0),
  method payment_method,
  reference text,                                                       -- wire id, check #, paypal txn, etc.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  constraint payment_receipts_source_chk check (
    case source
      when 'vendor'        then vendor_id is not null
      when 'campaign'      then campaign_creator_id is not null
      when 'telegram'      then creator_id is not null
      when 'onlyfans'      then of_deal_id is not null
      when 'house_rent'    then resident_id is not null
      when 'house_utility' then utility_id is not null
    end
  )
);

create index payment_receipts_source_idx   on payment_receipts(source);
create index payment_receipts_received_idx on payment_receipts(received_at desc);
create index payment_receipts_vendor_idx   on payment_receipts(vendor_id)            where vendor_id is not null;
create index payment_receipts_cc_idx       on payment_receipts(campaign_creator_id)  where campaign_creator_id is not null;
create index payment_receipts_creator_idx  on payment_receipts(creator_id)           where creator_id is not null;
create index payment_receipts_ofdeal_idx   on payment_receipts(of_deal_id)           where of_deal_id is not null;
create index payment_receipts_resident_idx on payment_receipts(resident_id)          where resident_id is not null;
create index payment_receipts_utility_idx  on payment_receipts(utility_id)           where utility_id is not null;

create trigger trg_payment_receipts_updated_at before update on payment_receipts
  for each row execute function set_updated_at();

-- ============================================================
-- 4. payment_allocations
-- ============================================================

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references payment_receipts(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index payment_allocations_receipt_idx on payment_allocations(receipt_id);
create index payment_allocations_period_idx  on payment_allocations(period_year, period_month);

-- ============================================================
-- 5. Status derivation helper
-- ============================================================

create or replace function derive_status(
  paid numeric,
  owed numeric,
  year_in int,
  month_in int
) returns payment_status
language plpgsql stable as $$
declare
  past_due boolean;
begin
  past_due := make_date(year_in, month_in, 1) + interval '1 month' < current_date;
  if owed <= 0 then
    return 'unpaid';
  end if;
  if paid >= owed then
    return 'paid';
  end if;
  if paid > 0 then
    return 'partial';
  end if;
  if past_due then
    return 'overdue';
  end if;
  return 'unpaid';
end $$;

comment on function derive_status is
  'Phase K-3: maps (paid, owed, period) → payment_status. paid≥owed=paid, 0<paid<owed=partial, past EOM=overdue, otherwise unpaid.';

-- ============================================================
-- 6. Reconciliation trigger
-- ============================================================
-- After any allocation insert/update/delete, recompute amount_paid + status
-- on the affected period row.
--
-- Implementation note: we case on the receipt's `source` and update exactly
-- the right table. Each branch is a static sum + update — no dynamic SQL.

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
      select coalesce(sum(pa.amount), 0) into total_paid
        from payment_allocations pa
        join payment_receipts pr on pr.id = pa.receipt_id
       where pr.source = 'house_rent'
         and pr.resident_id = rec.resident_id
         and pa.period_year  = changed_year
         and pa.period_month = changed_month;
      select coalesce(amount, 0) into amount_owed
        from house_rent_payments
       where resident_id  = rec.resident_id
         and period_year  = changed_year
         and period_month = changed_month;
      new_status := derive_status(total_paid, amount_owed, changed_year, changed_month);
      update house_rent_payments
         set amount_paid = total_paid,
             status      = new_status,
             paid_at     = case when new_status = 'paid' then coalesce(paid_at, current_date) else paid_at end
       where resident_id  = rec.resident_id
         and period_year  = changed_year
         and period_month = changed_month;

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

create trigger trg_payment_allocations_reconcile
  after insert or update or delete on payment_allocations
  for each row execute function reconcile_period_status();

-- ============================================================
-- 7. RPCs: allocate_fifo and allocate_specific
-- ============================================================
-- allocate_fifo: walk oldest unpaid/partial/overdue periods for the receipt's
-- obligor and spend the receipt across them until exhausted.
--
-- allocate_specific: assign a specific portion of a receipt to one (year, month).
-- Used by Talent receipts where the user picks the target month.

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
      select period_year, period_month,
             coalesce(amount, 0) as owed,
             coalesce(amount_paid, 0) as paid
        from house_rent_payments
       where resident_id = %L
         and status in ('unpaid','partial','overdue')
       order by period_year, period_month$q$, rec.resident_id)
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

comment on function allocate_fifo is
  'Phase K-3: auto-spreads receipt across the obligor''s oldest unpaid/partial/overdue periods until exhausted. Default for House and Vendor receipts.';

create or replace function allocate_specific(
  p_receipt_id uuid,
  p_year int,
  p_month int,
  p_amount numeric
) returns void
language plpgsql as $$
declare
  rec record;
  remaining numeric(12,2);
begin
  select * into rec from payment_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt % not found', p_receipt_id;
  end if;
  remaining := rec.amount - coalesce(
    (select sum(amount) from payment_allocations where receipt_id = p_receipt_id),
    0
  );
  if p_amount > remaining then
    raise exception 'allocation % exceeds remaining receipt balance %', p_amount, remaining;
  end if;
  insert into payment_allocations(receipt_id, period_year, period_month, amount)
    values (p_receipt_id, p_year, p_month, p_amount);
end $$;

comment on function allocate_specific is
  'Phase K-3: assigns a specific portion of a receipt to one (year, month). Used for Talent receipts where the user picks the target month.';

-- ============================================================
-- 8. RLS
-- ============================================================

alter table payment_receipts enable row level security;
create policy payment_receipts_admin on payment_receipts for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy payment_receipts_finance on payment_receipts for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

alter table payment_allocations enable row level security;
create policy payment_allocations_admin on payment_allocations for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy payment_allocations_finance on payment_allocations for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- ============================================================
-- 9. Realtime
-- ============================================================

alter publication supabase_realtime add table payment_receipts;
alter publication supabase_realtime add table payment_allocations;

-- ============================================================
-- 10. Comments
-- ============================================================

comment on table payment_receipts is
  'Phase K-3: every chunk of money received/paid out, with date + amount. Polymorphic obligor (vendor / campaign / telegram / onlyfans / house_rent / house_utility).';
comment on table payment_allocations is
  'Phase K-3: links a receipt to one or more (year, month) buckets on the obligor''s monthly grid. Trigger updates amount_paid + status on the affected period row.';
