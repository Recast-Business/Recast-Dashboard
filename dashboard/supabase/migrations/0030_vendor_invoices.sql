-- 0030_vendor_invoices.sql
-- Phase K-4: Ad-hoc vendor invoices.
--
-- One-off bills that don't belong on the recurring (vendor, year, month)
-- grid. Examples:
--   • One-time legal fee
--   • Equipment purchase ("MacBook for Bruno")
--   • Contractor invoice for a specific project
--
-- Each invoice has its own issue date + due date + amount + status,
-- independent of the calendar-month cycle. They surface in the OverdueDrawer
-- when due_date < current_date AND status != 'paid'.
--
-- Intentionally NOT tied to the K-3 receipt allocation engine — invoices
-- toggle paid/unpaid directly via the dialog. Engine integration can land
-- later if a real workflow demands it.

create table vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  description text not null,                      -- "One-time legal fee", "MacBook for Bruno"
  issued_at date not null default current_date,   -- when the invoice was raised
  due_date date not null,                         -- custom due date (not necessarily EOM)
  amount numeric(12,2) not null check (amount > 0),
  status payment_status not null default 'unpaid',
  paid_at date,
  invoice_url text,
  payment_method payment_method,
  payment_reference text,                         -- wire id, check #, etc.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index vendor_invoices_vendor_idx on vendor_invoices(vendor_id);
create index vendor_invoices_due_idx on vendor_invoices(due_date) where status != 'paid';
create index vendor_invoices_status_idx on vendor_invoices(status);

create trigger trg_vendor_invoices_updated_at before update on vendor_invoices
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table vendor_invoices enable row level security;
create policy vendor_invoices_admin on vendor_invoices for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy vendor_invoices_finance on vendor_invoices for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table vendor_invoices;

-- ============================================================
-- Extend mark_overdue_payments() to flag invoices past their due_date
-- ============================================================
-- The existing function (0024) flips status='unpaid' rows past EOM to
-- 'overdue'. Invoices use a custom due_date instead of (year, month),
-- so they need their own update inside the same function.

create or replace function mark_overdue_payments() returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_total int := 0;
  v_n int;
begin
  -- vendor_payments
  update vendor_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- campaign_payments
  update campaign_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- tele_period_performance
  update tele_period_performance
  set status = 'overdue'
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- of_period_performance
  update of_period_performance
  set status = 'overdue'
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- house_utility_payments
  update house_utility_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- house_rent_payments
  update house_rent_payments
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- vendor_invoices — past their custom due_date
  update vendor_invoices
  set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and due_date < current_date;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return json_build_object('total_flipped', v_total, 'ran_at', now());
end $$;

comment on table vendor_invoices is
  'Phase K-4: ad-hoc vendor invoices. One-off bills with a custom due_date, separate from the recurring monthly vendor_payments grid.';
