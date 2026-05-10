-- 0033_talent_invoices.sql
-- Phase M-6: Talent Paying Us — invoice ledger.
--
-- Per Gustavo: "Talent Paying Us should only be used for invoice tracking,
-- payment status, balances, due dates, and invoice links. Each monthly
-- square should represent the actual invoice for that month."
--
-- One invoice per (creator, year, month) — covers all platforms the
-- creator earns on that month. The math (gross / net / Recast share)
-- continues to live in the Calculator section (M-5); the amount Frazier
-- enters here is the final invoice total.
--
-- Mirrors the vendor_invoices (M-4) shape: standalone table, simple
-- status flip via "Mark paid" UI. Not wired into the K-3 receipt
-- allocation engine (yet) — kept simple to match how Frazier actually
-- enters this data day-to-day.

create table talent_invoices (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  invoice_number text,                              -- e.g. "INV-2026-014"; nullable
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  invoice_url text,
  notes text,
  status payment_status not null default 'unpaid',
  amount_paid numeric(12,2) not null default 0,
  paid_at date,
  payment_method payment_method,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  -- One invoice per creator per month. Gustavo's vision: a creator with
  -- both OF and Tele in March still gets ONE March invoice that totals
  -- everything they owe Recast that month.
  unique (creator_id, period_year, period_month)
);

create index talent_invoices_creator_idx on talent_invoices(creator_id);
create index talent_invoices_period_idx on talent_invoices(period_year, period_month);
create index talent_invoices_status_idx on talent_invoices(status);
create index talent_invoices_due_idx on talent_invoices(due_date) where status != 'paid';

create trigger trg_talent_invoices_updated_at before update on talent_invoices
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table talent_invoices enable row level security;
create policy talent_invoices_admin on talent_invoices for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy talent_invoices_finance on talent_invoices for all
  using (auth_role() = 'finance') with check (auth_role() = 'finance');

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table talent_invoices;

-- ============================================================
-- Extend mark_overdue_payments to handle talent invoices
-- ============================================================
-- Same pattern as vendor_invoices (K-4) and the K-3 period tables:
-- past-due unpaid rows flip to overdue daily via the pg_cron job
-- scheduled in 0028.

create or replace function mark_overdue_payments() returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_total int := 0;
  v_n int;
begin
  -- vendor_payments
  update vendor_payments set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- campaign_payments
  update campaign_payments set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- tele_period_performance
  update tele_period_performance set status = 'overdue'
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- of_period_performance
  update of_period_performance set status = 'overdue'
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- house_utility_payments
  update house_utility_payments set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- house_rent_payments
  update house_rent_payments set status = 'overdue', updated_at = now()
  where status = 'unpaid'
    and (make_date(period_year, period_month, 1) + interval '1 month')::date <= current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- vendor_invoices (custom due_date, K-4)
  update vendor_invoices set status = 'overdue', updated_at = now()
  where status = 'unpaid' and due_date < current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- talent_invoices (M-6, custom due_date, same shape)
  update talent_invoices set status = 'overdue', updated_at = now()
  where status = 'unpaid' and due_date < current_date;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return json_build_object('total_flipped', v_total, 'ran_at', now());
end $$;

comment on table talent_invoices is
  'Phase M-6: Talent Paying Us invoices. One invoice per (creator, year, month). The Calculator section (M-5) computes the amount; this table tracks how the invoice is paid.';
