# Banking Vault — Security Notes

The banking_details table holds sensitive payment-rail information (SWIFT, IBAN, ACC, card details). Phase B (migration `0021_vault_encryption.sql`) encrypts these columns at rest.

## How it works

- Sensitive fields (`account_holder`, `account_number`, `swift_sort`, `aba_iban_bsb_ifsc`, `card_holder`, `card_expiry`, `notes`) are stored as **bytea ciphertext** — the raw plaintext columns no longer exist.
- Encryption uses **pgcrypto** (`pgp_sym_encrypt` / `pgp_sym_decrypt`) with a symmetric key.
- The key lives in **Supabase Vault** (`vault.secrets`, name = `banking_encryption_key`) — encrypted at rest by Supabase's project master key. It never appears in git, env vars, app code, or query logs.
- Application code goes through three RPC functions:
  - `vault_get_banking(uuid)` — returns one row, decrypted, after audit-logging the read
  - `vault_upsert_banking(...)` — encrypts inputs, writes the row, audit-logs the write
  - `vault_delete_banking(uuid)` — audit-logs then deletes
- Every call writes a row to `vault_access_log` with `who, when, what, fields`.
- A backstop trigger on `banking_details` also logs any direct INSERT/UPDATE/DELETE done via raw SQL (so Supabase Studio mutations don't slip past the audit).

## Roles

- **admin + finance** → can call all three RPCs and read `vault_access_log`.
- **partner / scout / unauthenticated** → forbidden (the RPC raises an exception).

## Backup the key — do this once after running 0021

The key is auto-generated when the migration runs. **You must back it up offline**, otherwise if Supabase ever loses the project master key (extremely unlikely but theoretically possible during disaster recovery), every encrypted column becomes permanently unreadable.

In Supabase **SQL Editor**, run:

```sql
select decrypted_secret
from vault.decrypted_secrets
where name = 'banking_encryption_key';
```

Copy the output (a 64-char hex string), and store it in:
- 1Password / Bitwarden in a "Recast — Production Secrets" vault, **and**
- A second offline location (encrypted USB stick in a safe, or printed in a sealed envelope).

Label the entry: `Recast banking_encryption_key — restore via select vault.create_secret('<value>', 'banking_encryption_key')`.

## Key rotation (do this annually or on suspected compromise)

1. Generate a new key: `select encode(gen_random_bytes(32), 'hex');`
2. Read all banking rows decrypted with the old key
3. Re-encrypt each field with the new key
4. Replace the Vault secret: `select vault.update_secret(<id>, '<new_key>');`
5. Verify reads work, then back up the new key

A future migration will provide a `vault_rotate_banking_key()` helper. For now this is manual.

## What if I lose the key?

The data is gone. By design. There is no backdoor.

## Recovery checklist (if Supabase project is restored from a backup)

1. Restore the database backup
2. From your offline backup, run:
   ```sql
   select vault.create_secret('<the_64_char_key>', 'banking_encryption_key');
   ```
3. Verify with: `select * from vault_get_banking('<some_known_id>');`

## Audit log retention

`vault_access_log` is append-only and never automatically pruned. Review periodically. To export to a file system / SIEM (Phase H+):

```sql
select * from vault_access_log where accessed_at > now() - interval '30 days' order by accessed_at desc;
```

## Threat model — what this protects against

✅ Database snapshot leak — ciphertext is useless without the Vault key
✅ Supabase Studio user with read access to `banking_details` — sees only ciphertext
✅ A partner role compromise — partner has no access to the table or the RPCs
✅ A Vercel build-time secret leak — the encryption key is not in any env var

⚠️ Does NOT protect against:
- A compromised admin or finance Supabase Auth account — they can call `vault_get_banking` legitimately
  (mitigation: enforce MFA on those accounts in Phase G)
- A compromised Supabase project master key — Supabase's responsibility (they have SOC 2 / ISO 27001)
- Plaintext leaking through application logs after decryption — application code must not log decrypted output
- Card PAN storage (we never store full card numbers — only `last4`, enforced by a CHECK constraint)
