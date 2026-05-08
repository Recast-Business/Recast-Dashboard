import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * The decrypted shape of a banking_details row, returned by the
 * vault_get_banking RPC. Each call to `useBanking(id)` produces a
 * vault_access_log entry — keep it short-lived (only fetch when the
 * sensitive panel is actually open).
 */
export interface DecryptedBanking {
  id: string;
  vendor_id: string | null;
  creator_id: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  swift_sort: string | null;
  aba_iban_bsb_ifsc: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_holder: string | null;
  card_expiry: string | null;
  account_profile: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * NON-decryptive list query — reads the public columns from banking_details
 * (bank_name, card_brand, card_last4, account_profile) so the list view
 * doesn't trigger an audit log entry per row. Decryption only happens when
 * the user opens the sensitive panel via `useBankingDecrypt(id)`.
 */
export function useBankingList(args: { vendorId?: string | null; creatorId?: string | null }) {
  return useQuery({
    queryKey: ["banking", "list", args.vendorId ?? "", args.creatorId ?? ""],
    enabled: !!(args.vendorId || args.creatorId),
    queryFn: async () => {
      let q = supabase
        .from("banking_details")
        .select(
          "id, vendor_id, creator_id, bank_name, card_brand, card_last4, account_profile, created_at, updated_at",
        )
        .order("created_at", { ascending: false });
      if (args.vendorId) q = q.eq("vendor_id", args.vendorId);
      if (args.creatorId) q = q.eq("creator_id", args.creatorId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Calls vault_get_banking RPC — DECRYPTS sensitive fields. Each call is
 * audit-logged. Use this only when the user has opened the sensitive
 * banking panel for that record.
 */
export function useBankingDecrypt(bankingId: string | null) {
  return useQuery({
    queryKey: ["banking", "decrypt", bankingId],
    enabled: !!bankingId,
    staleTime: 0,           // never serve from cache — always re-fetch (and re-log)
    gcTime: 0,              // drop from cache as soon as nothing is using it
    queryFn: async () => {
      if (!bankingId) return null;
      const { data, error } = await supabase.rpc("vault_get_banking", { p_id: bankingId });
      if (error) throw error;
      const rows = (data ?? []) as DecryptedBanking[];
      return rows[0] ?? null;
    },
  });
}

export interface BankingInput {
  id?: string | null;                // null/undefined = insert
  vendor_id?: string | null;
  creator_id?: string | null;
  bank_name?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  swift_sort?: string | null;
  aba_iban_bsb_ifsc?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  card_holder?: string | null;
  card_expiry?: string | null;
  account_profile?: string | null;
  notes?: string | null;
}

export function useUpsertBanking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BankingInput) => {
      const { data, error } = await supabase.rpc("vault_upsert_banking", {
        p_id: input.id ?? null,
        p_vendor_id: input.vendor_id ?? null,
        p_creator_id: input.creator_id ?? null,
        p_bank_name: input.bank_name ?? null,
        p_account_holder: input.account_holder ?? null,
        p_account_number: input.account_number ?? null,
        p_swift_sort: input.swift_sort ?? null,
        p_aba_iban_bsb_ifsc: input.aba_iban_bsb_ifsc ?? null,
        p_card_brand: input.card_brand ?? null,
        p_card_last4: input.card_last4 ?? null,
        p_card_holder: input.card_holder ?? null,
        p_card_expiry: input.card_expiry ?? null,
        p_account_profile: input.account_profile ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as string; // returns the banking_details.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banking"] }),
  });
}

export function useDeleteBanking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("vault_delete_banking", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banking"] }),
  });
}
