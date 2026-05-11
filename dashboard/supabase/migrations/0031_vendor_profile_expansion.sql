-- 0031_vendor_profile_expansion.sql
-- Phase M-1: Expand vendors into a proper roster — adds the fields
-- Gustavo asked for so vendors work like creators do (a profile you
-- create once and then reference by ID when logging invoices).
--
-- New columns on `vendors`:
--   • username_handle  — Discord / Telegram / generic IM handle
--   • nda_signed       — boolean toggle (the important field per Gustavo)
--   • nda_url          — optional link to the signed NDA (Drive, Dropbox, etc.)
--
-- All three are nullable / default-false so existing rows are unaffected.
-- The existing fields (name, kind, contact_*, payment_method, account_profile,
-- notes, active) already cover everything else Gustavo wanted.

alter table vendors
  add column if not exists username_handle text,
  add column if not exists nda_signed boolean not null default false,
  add column if not exists nda_url text;

create index if not exists vendors_nda_signed_idx
  on vendors(nda_signed) where nda_signed = false;

comment on column vendors.username_handle is
  'IM handle (Discord, Telegram, etc.) for the vendor — separate from contact_email/phone.';
comment on column vendors.nda_signed is
  'Phase M-1: tracks whether an NDA is on file with this vendor. Required signal for compliance.';
comment on column vendors.nda_url is
  'Optional link to the signed NDA (Google Drive, Dropbox, etc.). nda_signed is the source of truth; the URL is a convenience.';
