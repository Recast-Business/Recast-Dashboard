-- 0048_rename_finance_to_accounting.sql
-- Roles audit Phase 2 — semantic rename of the 'finance' role to
-- 'accounting'. Gus's seat is the only one using it, his email is
-- now accounting@recast.gg, and "accounting" reads better in the UI
-- (sidebar chip, audit log, etc).
--
-- Mechanics:
--
--   1. ALTER TYPE user_role RENAME VALUE — flips the label in place.
--      Postgres stores enum values by OID, so existing data rows in
--      profiles.role + vault_access_log.user_role keep their OID
--      and start reading as 'accounting' automatically. RLS policy
--      bodies are stored as parsed pg_node_tree with bound OIDs, so
--      they continue to evaluate correctly after the rename without
--      needing DROP/CREATE.
--
--   2. PL/pgSQL function bodies (vault_*) are stored as text and
--      re-parsed on first call per session. The literal 'finance'
--      in those bodies becomes invalid after the rename (no such
--      enum value), so the three vault RPCs must be recreated with
--      'accounting' in their role checks.
--
--   3. The _vault_log_access helper + _banking_details_audit_trigger
--      DO NOT hardcode the literal — they just write v_role through
--      to vault_access_log. Untouched.

-- ============================================================
-- 1. Rename the enum value
-- ============================================================

alter type user_role rename value 'finance' to 'accounting';

-- ============================================================
-- 2. Recreate the three vault RPCs with the new literal
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

  if v_role not in ('admin', 'accounting') then
    raise exception 'forbidden: vault access requires admin or accounting role';
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


create or replace function vault_upsert_banking(
  p_id uuid,
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

  if v_role not in ('admin', 'accounting') then
    raise exception 'forbidden: vault access requires admin or accounting role';
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


create or replace function vault_delete_banking(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role user_role;
begin
  select role into v_role from profiles where profiles.id = auth.uid();

  if v_role not in ('admin', 'accounting') then
    raise exception 'forbidden: vault access requires admin or accounting role';
  end if;

  perform _vault_log_access(p_id, 'delete', array['*']);

  delete from banking_details where id = p_id;
end $$;

grant execute on function vault_delete_banking(uuid) to authenticated;
