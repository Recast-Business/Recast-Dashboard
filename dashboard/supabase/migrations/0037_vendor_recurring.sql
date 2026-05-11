-- 0037_vendor_recurring.sql
-- Round 4 (Gustavo): per-vendor opt-in for recurring monthly payments.
--
-- WHY
-- ───
-- Most Recast vendors vary month to month, so the /vendors grid stays
-- manual. But a handful bill the same amount every month (Hostinger,
-- GitHub seats, etc.). Manually creating those identical rows month
-- after month is friction Gustavo wants gone.
--
-- This migration adds an opt-in flag + a default amount per vendor.
-- When the flag is ON the grid surfaces an "Expected $X" placeholder
-- cell each month — clicking it opens the existing payment dialog
-- pre-filled with the amount, so logging a recurring payment becomes
-- a one-click confirm instead of a from-scratch entry. The placeholder
-- itself is pure UI — no DB rows are created until you confirm.
--
-- Additive only. No data change for non-recurring vendors.

alter table vendors
  add column if not exists recurring_monthly boolean not null default false,
  add column if not exists recurring_amount  numeric;

comment on column vendors.recurring_monthly is
  'Round 4: when TRUE, the vendor grid renders a placeholder "Expected" '
  'cell for each unbilled month using recurring_amount. Clicking opens '
  'the payment dialog with the amount pre-filled. Opt-in per vendor — '
  'default FALSE so most vendors stay fully manual.';

comment on column vendors.recurring_amount is
  'Round 4: default monthly payment amount. Used as the pre-fill on '
  'recurring placeholders. NULL when recurring_monthly is FALSE.';

-- Sanity: if a vendor is recurring, the amount should be set. Enforce
-- at the application layer rather than the database — Gustavo may
-- want to flip recurring on first, set the amount in a follow-up
-- save without the DB rejecting the transition.
