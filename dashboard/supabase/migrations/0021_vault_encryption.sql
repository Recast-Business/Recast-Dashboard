-- 0021_vault_encryption.sql
-- Phase B of the Gustavo Finance overhaul.
-- Adds column-level encryption + access audit on banking_details.
--
-- Security model:
--   • The encryption key lives in Supabase Vault (vault.secrets), encrypted at rest by Supabase
--     with a project-level master key. It never appears in git, env vars, or app code.
--   • Sensitive columns are stored as bytea (ciphertext) — plaintext columns are dropped.
--   • Reads/writes go through SECURITY DEFINER RPC functions (vault_get_banking,
--     vault_upsert_banking, vault_delete_banking). Each function:
--       (a) Checks the caller's role (admin or finance — anything else: forbidden)
--       (b) Encrypts/decrypts using the Vault-stored key
--       (c) Inserts a row into vault_access_log for audit
--   • Direct table access via the Supabase client is still RLS-gated to admin+finance,
--     and direct mutations also fire an audit trigger as a backstop.
--
-- After this migration runs, ONE manual step is required (see bottom of file).

-- ============================================================
-- 1. Extensions
-- ============================================================

create extension if not exists pgcrypto;
-- Supabase Vault is provided by the supabase_vault extension and is enabled by default
-- on all Supabase projects (vault.secrets / vault.decrypted_secrets exist already).

-- ============================================================
-- 2. Replace plaintext sensitive columns with bytea ciphertext
-- ============================================================
-- Safe because no banking_details rows have been inserted yet (Phase A only created the table).

alter table banking_details
  drop column if exists account_holder,
  drop column if exists account_number,
  drop column if exists swift_sort,
  drop column if exists aba_iban_bsb_ifsc,
  drop column if exists card_holder,
  drop column if exists card_expiry;

alter table banking_details
  add column account_holder_enc       bytea,
  add column account_number_enc       bytea,
  add column swift_sort_enc           bytea,
  add column aba_iban_bsb_ifsc_enc    bytea,
  add column card_holder_enc          bytea,
  add column card_expiry_enc          bytea,
  add column notes_enc                bytea;

-- The plaintext `notes` column gets dropped too — moved to encrypted form
alter table banking_details drop column if exists notes;

comment on column banking_details.account_holder_enc is
  'Encrypted with pgcrypto pgp_sym_encrypt; key from Supabase Vault. Read via vault_get_banking().';

-- ============================================================
-- 3. Internal helper: read the active encryption key from Supabase Vault
-- ============================================================
-- Wrapped so call sites never see the key in query plans or logs.
-- SECURITY DEFINER means the helper runs as the function owner (postgres),
-- which is the only role with SELECT on vault.decrypted_secrets.

create or replace function _vault_banking_key() returns text
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'banking_encryption_key'
  limit 1;

  if v_key is null then
    raise exception 'banking_encryption_key not found in Vault — run the bootstrap step';
  end if;

  return v_key;
end $$;

revoke all on function _vault_banking_key() from public, anon, authenticated;
-- Only the postgres role (and SECURITY DEFINER functions) can call this.

-- ============================================================
-- 4. Internal helper: log access to vault_access_log
-- ============================================================

create or replace function _vault_log_access(
  p_banking_id uuid,
  p_action text,
  p_fields text[]
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_role user_role;
begin
  select email, role into v_email, v_role
  from profiles where id = v_user_id;

  insert into vault_access_log
    (banking_id, user_id, user_email, user_role, action, fields)
  values
    (p_banking_id, v_user_id, v_email, v_role, p_action, p_fields);
end $$;

revoke all on function _vault_log_access(uuid, text, text[]) from public, anon, authenticated;

-- ============================================================
-- 5. Public RPC: read a banking row, decrypted, with audit
-- ============================================================

create or replace function vault_get_banking(p_id uuid)
returns table (
  id uuid,
  vendor_id uuid,
  creator_id uuid,
  bank_name text,
  account_holder text,
  account_number text,
  swift_sort text,
  aba_iban_bsb_ifsc text,
  card_brand text,
  card_last4 text,
  card_holder text,
  card_expiry text,
  account_profile text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_role user_role;
  v_key text;
begin
  select role into v_role from profiles where profiles.id = auth.uid();

  if v_role not in ('admin', 'finance') then
    raise exception 'forbidden: vault access requires admin or finance role';
  end if;

  v_key := _vault_banking_key();

  perform _vault_log_access(
    p_id, 'view',
    array['account_holder','account_number','swift_sort','aba_iban_bsb_ifsc','card_holder','card_expiry','notes']
  );

  return query
  select
    b.id,
    b.vendor_id,
    b.creator_id,
    b.bank_name,
    case when b.account_holder_enc    is null then null else pgp_sym_decrypt(b.account_holder_enc,    v_key) end,
    case when b.account_number_enc    is null then null else pgp_sym_decrypt(b.account_number_enc,    v_key) end,
    case when b.swift_sort_enc        is null then null else pgp_sym_decrypt(b.swift_sort_enc,        v_key) end,
    case when b.aba_iban_bsb_ifsc_enc is null then null else pgp_sym_decrypt(b.aba_iban_bsb_ifsc_enc, v_key) end,
    b.card_brand,
    b.card_last4,
    case when b.card_holder_enc       is null then null else pgp_sym_decrypt(b.card_holder_enc,       v_key) end,
    case when b.card_expiry_enc       is null then null else pgp_sym_decrypt(b.card_expiry_enc,       v_key) end,
    b.account_profile,
    case when b.notes_enc             is null then null else pgp_sym_decrypt(b.notes_enc,             v_key) end,
    b.created_at,
    b.updated_at
  from banking_details b
  where b.id = p_id;
end $$;

grant execute on function vault_get_banking(uuid) to authenticated;

-- ============================================================
-- 6. Public RPC: upsert (insert or update) a banking row, with encryption + audit
-- ============================================================

create or replace function vault_upsert_banking(
  p_id uuid,                          -- pass null to insert, uuid to update
  p_vendor_id uuid,
  p_creator_id uuid,
  p_bank_name text,
  p_account_holder text,
  p_account_number text,
  p_swift_sort text,
  p_aba_iban_bsb_ifsc text,
  p_card_brand text,
  p_card_last4 text,
  p_card_holder text,
  p_card_expiry text,
  p_account_profile text,
  p_notes text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_role user_role;
  v_key text;
  v_id uuid;
  v_action text;
begin
  select role into v_role from profiles where profiles.id = auth.uid();

  if v_role not in ('admin', 'finance') then
    raise exception 'forbidden: vault access requires admin or finance role';
  end if;

  if p_card_last4 is not null and p_card_last4 !~ '^[0-9]{4}$' then
    raise exception 'card_last4 must be exactly 4 digits — never store full PAN';
  end if;

  v_key := _vault_banking_key();

  if p_id is null then
    v_action := 'create';
    insert into banking_details (
      vendor_id, creator_id, bank_name,
      account_holder_enc, account_number_enc, swift_sort_enc, aba_iban_bsb_ifsc_enc,
      card_brand, card_last4, card_holder_enc, card_expiry_enc,
      account_profile, notes_enc
    ) values (
      p_vendor_id, p_creator_id, p_bank_name,
      case when p_account_holder    is null then null else pgp_sym_encrypt(p_account_holder,    v_key) end,
      case when p_account_number    is null then null else pgp_sym_encrypt(p_account_number,    v_key) end,
      case when p_swift_sort        is null then null else pgp_sym_encrypt(p_swift_sort,        v_key) end,
      case when p_aba_iban_bsb_ifsc is null then null else pgp_sym_encrypt(p_aba_iban_bsb_ifsc, v_key) end,
      p_card_brand, p_card_last4,
      case when p_card_holder       is null then null else pgp_sym_encrypt(p_card_holder,       v_key) end,
      case when p_card_expiry       is null then null else pgp_sym_encrypt(p_card_expiry,       v_key) end,
      p_account_profile,
      case when p_notes             is null then null else pgp_sym_encrypt(p_notes,             v_key) end
    )
    returning id into v_id;
  else
    v_action := 'update';
    update banking_details set
      vendor_id            = p_vendor_id,
      creator_id           = p_creator_id,
      bank_name            = p_bank_name,
      account_holder_enc   = case when p_account_holder    is null then null else pgp_sym_encrypt(p_account_holder,    v_key) end,
      account_number_enc   = case when p_account_number    is null then null else pgp_sym_encrypt(p_account_number,    v_key) end,
      swift_sort_enc       = case when p_swift_sort        is null then null else pgp_sym_encrypt(p_swift_sort,        v_key) end,
      aba_iban_bsb_ifsc_enc= case when p_aba_iban_bsb_ifsc is null then null else pgp_sym_encrypt(p_aba_iban_bsb_ifsc, v_key) end,
      card_brand           = p_card_brand,
      card_last4           = p_card_last4,
      card_holder_enc      = case when p_card_holder       is null then null else pgp_sym_encrypt(p_card_holder,       v_key) end,
      card_expiry_enc      = case when p_card_expiry       is null then null else pgp_sym_encrypt(p_card_expiry,       v_key) end,
      account_profile      = p_account_profile,
      notes_enc            = case when p_notes             is null then null else pgp_sym_encrypt(p_notes,             v_key) end
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'banking_details row % not found', p_id;
    end if;
  end if;

  perform _vault_log_access(
    v_id, v_action,
    array['account_holder','account_number','swift_sort','aba_iban_bsb_ifsc','card_holder','card_expiry','notes']
  );

  return v_id;
end $$;

grant execute on function vault_upsert_banking(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ============================================================
-- 7. Public RPC: delete a banking row, with audit
-- ============================================================

create or replace function vault_delete_banking(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role user_role;
begin
  select role into v_role from profiles where profiles.id = auth.uid();

  if v_role not in ('admin', 'finance') then
    raise exception 'forbidden: vault access requires admin or finance role';
  end if;

  perform _vault_log_access(p_id, 'delete', array['*']);

  delete from banking_details where id = p_id;
end $$;

grant execute on function vault_delete_banking(uuid) to authenticated;

-- ============================================================
-- 8. Backstop audit trigger on direct mutations
-- ============================================================
-- If anyone bypasses the RPC and uses raw INSERT/UPDATE/DELETE (e.g. via Supabase Studio),
-- this trigger still logs the access.

create or replace function _banking_details_audit_trigger() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_role user_role;
  v_user_id uuid := auth.uid();
  v_action text;
  v_target_id uuid;
begin
  select email, role into v_email, v_role from profiles where id = v_user_id;

  if tg_op = 'INSERT' then
    v_action := 'direct_insert';
    v_target_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_action := 'direct_update';
    v_target_id := new.id;
  elsif tg_op = 'DELETE' then
    v_action := 'direct_delete';
    v_target_id := old.id;
  end if;

  insert into vault_access_log
    (banking_id, user_id, user_email, user_role, action, fields)
  values
    (v_target_id, v_user_id, v_email, v_role, v_action,
     array['*direct mutation*']);

  return coalesce(new, old);
end $$;

drop trigger if exists trg_banking_details_audit on banking_details;
create trigger trg_banking_details_audit
  after insert or update or delete on banking_details
  for each row execute function _banking_details_audit_trigger();

-- ============================================================
-- 9. Bootstrap the encryption key
-- ============================================================
-- Generates a fresh 64-character hex secret and stores it in Vault.
-- IMPORTANT: This runs only if the secret doesn't already exist.
-- After it runs, the plaintext key is unrecoverable from the database
-- (it's stored encrypted in vault.secrets with the project master key).
--
-- ⚠️  BACKUP — write down or export the result of:
--     select * from vault.decrypted_secrets where name = 'banking_encryption_key';
-- and store it offline (1Password, etc). If Supabase loses the project
-- master key for any reason, you'll need this to recover encrypted data.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'banking_encryption_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'banking_encryption_key',
      'Symmetric key for banking_details column-level encryption. ' ||
      'Phase B Recast Finance overhaul. Rotate by re-encrypting all rows with a new key.'
    );
  end if;
end $$;
