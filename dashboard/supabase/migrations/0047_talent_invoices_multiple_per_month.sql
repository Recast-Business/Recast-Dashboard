-- 0047_talent_invoices_multiple_per_month.sql
-- R5 follow-up (Gus): drop the one-invoice-per-(creator, month) rule.
--
-- Phase M-6's talent_invoices table enforced UNIQUE (creator_id,
-- period_year, period_month) with the design intent that "a creator
-- with both OF and Tele in March still gets ONE March invoice that
-- totals everything they owe Recast that month". Gus needs to log
-- multiple separate invoices for the same month (e.g. Adelia owes
-- three invoices for March), so the constraint is the blocker.
--
-- Schema change: drop the unique constraint. Everything downstream
-- (status, amount_paid, allocation engine) already operates on a
-- per-row basis, so nothing else needs to change in the DB.
--
-- IDEMPOTENT — DROP CONSTRAINT IF EXISTS handles re-runs.
--
-- Notes:
--   • The 4 supporting indexes from 0033 (creator, period, status,
--     due_date) stay. They were created independently of the unique
--     constraint and are still useful for query performance.
--   • talent_invoices.invoice_number remains unique only by virtue
--     of it being nullable + the user-supplied check; we don't add
--     a DB-level uniqueness rule on it because Gus's billing
--     workflow doesn't always include an invoice number at all.

alter table talent_invoices
  drop constraint if exists talent_invoices_creator_id_period_year_period_month_key;

comment on table talent_invoices is
  'R5 follow-up: multiple rows per (creator_id, period_year, period_month) '
  'now allowed. The grid aggregates amount + worst-status per cell and the '
  'TalentMonthInvoicesDialog handles per-invoice CRUD for cells with > 1 row.';
