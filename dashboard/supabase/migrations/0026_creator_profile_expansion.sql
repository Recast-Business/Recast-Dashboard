-- Phase J-1 — Creator profile expansion.
--
-- Adds the fields Gustavo asked for so each creator carries everything we
-- need to invoice them without checking a contract or spreadsheet.
--   • legal_name, business_name        — for invoice headers
--   • email, phone, address            — contact info
--   • payment_method_pref              — free-text note (e.g. "Wise → ABA …")
--   • tax_id                           — optional W-9 / EIN reference
--   • commission_pct_by_platform       — JSONB, {division: pct}
--
-- For Phase J the JSONB shape is flat:
--   { "onlyfans": 50, "telegram": 20, "efuse": null }
-- Phase K will extend it to tiered thresholds:
--   { "onlyfans": [ { "threshold": 0, "pct": 50 }, { "threshold": 10000, "pct": 40 } ] }
-- The column is JSONB so the migration is forward-compatible — no schema
-- change needed when tiering lands.

begin;

alter table creators
  add column if not exists legal_name              text,
  add column if not exists business_name           text,
  add column if not exists email                   text,
  add column if not exists phone                   text,
  add column if not exists address                 text,
  add column if not exists payment_method_pref     text,
  add column if not exists tax_id                  text,
  add column if not exists commission_pct_by_platform jsonb not null default '{}'::jsonb;

-- Helpful index for the "look up creator by email" workflow when invoicing
create index if not exists creators_email_idx on creators (lower(email));

comment on column creators.legal_name is
  'Full legal name for invoicing — distinct from public display name.';
comment on column creators.business_name is
  'Optional business / LLC name if creator invoices through an entity.';
comment on column creators.payment_method_pref is
  'Free-text note: preferred payment method + light reference info '
  '(e.g. "Wise → ABA 026013673"). NEVER store full bank account numbers '
  'here — those go through the encrypted vault if we ever turn it back on.';
comment on column creators.tax_id is
  'Optional. W-9 / EIN / VAT / etc reference, free-text.';
comment on column creators.commission_pct_by_platform is
  'JSONB map of division → commission %. Phase J shape: {onlyfans: 50}. '
  'Phase K will extend to tiered thresholds.';

commit;

-- Verify (run separately):
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'creators'
--     and column_name in (
--       'legal_name','business_name','email','phone','address',
--       'payment_method_pref','tax_id','commission_pct_by_platform'
--     );
