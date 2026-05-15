-- 0046_talent_grid_tracking.sql
-- R5 follow-up (Gus): the Invoice page grids ("Talent Paying Us" + "Talent
-- We Pay") used to filter rows to only show creators/vendors that had
-- ≥1 invoice/payment in the year. Gus's spec flips this: clicking
-- "+ Add Talent" picks a creator/vendor from the existing roster and
-- adds them to the grid as an empty row. The user then clicks per-month
-- "+" cells to create the invoice/payment for that specific month.
--
-- That workflow needs to remember "Gus added Jane to the 2026 grid but
-- hasn't invoiced her yet" across page reloads. This table is the
-- persistent set of grid rows per (side, year).
--
-- IDEMPOTENT — safe to re-run.
--
-- Note on the renaming: the page label is now "Invoice" (Sweep cd570e2)
-- but the route stays /finance and the database tables keep their
-- finance/talent_* naming for backwards compat with existing data.

create table if not exists talent_grid_tracking (
  id          uuid primary key default gen_random_uuid(),
  side        text not null check (side in ('paying_us', 'we_pay')),
  creator_id  uuid references creators(id) on delete cascade,
  vendor_id   uuid references vendors(id) on delete cascade,
  year        int not null,
  added_by    uuid references profiles(id),
  added_at    timestamptz not null default now(),
  -- Exactly one of creator_id / vendor_id is populated, matching `side`.
  constraint talent_grid_tracking_side_chk check (
    case side
      when 'paying_us' then creator_id is not null and vendor_id is null
      when 'we_pay'    then vendor_id  is not null and creator_id is null
    end
  ),
  -- One tracking row per (side, target, year). Re-adding is a no-op
  -- on the client (idempotent insert).
  unique (side, creator_id, vendor_id, year)
);

create index if not exists talent_grid_tracking_year_idx
  on talent_grid_tracking(side, year);
create index if not exists talent_grid_tracking_creator_idx
  on talent_grid_tracking(creator_id) where creator_id is not null;
create index if not exists talent_grid_tracking_vendor_idx
  on talent_grid_tracking(vendor_id)  where vendor_id is not null;

comment on table talent_grid_tracking is
  'R5 follow-up: explicit set of rows visible on each Invoice grid per '
  '(side, year). Rows are added when the user picks a talent from the '
  '"+ Add Talent" picker and removed when the user clears them or when '
  'the underlying creator/vendor is deleted (cascade).';

-- ============================================================
-- RLS
-- ============================================================
-- Read: any authenticated user (so partner/operator can see if a row
-- is on the grid). Write: admin + finance only — only the people who
-- can also issue invoices should be adding/removing grid rows.

alter table talent_grid_tracking enable row level security;

drop policy if exists talent_grid_tracking_read on talent_grid_tracking;
create policy talent_grid_tracking_read on talent_grid_tracking
  for select to authenticated using (true);

drop policy if exists talent_grid_tracking_write on talent_grid_tracking;
create policy talent_grid_tracking_write on talent_grid_tracking
  for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'finance')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'finance')
    )
  );
