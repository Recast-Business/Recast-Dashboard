import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { VendorAgreement } from "@/types/finance";

/**
 * R5 Sweep 4 — CRUD hooks for the vendor_agreements table.
 *
 * Parallels useCreatorAgreements (Sweep 3b/3d). Per-vendor list +
 * list-page variant + replace-all mutation. Vendors don't have
 * OF-style pages, so the secondary grouping is `category` (MSA / SOW /
 * NDA / DPA / Other) rather than `page_name`.
 *
 * RLS (from migration 0045):
 *   • Read: any authenticated user
 *   • Write: admin + finance only
 */

export function useVendorAgreements(vendorId: string | null | undefined) {
  return useQuery({
    enabled: !!vendorId,
    queryKey: ["vendor-agreements", vendorId],
    queryFn: async (): Promise<VendorAgreement[]> => {
      const { data, error } = await supabase
        .from("vendor_agreements")
        .select("*")
        .eq("vendor_id", vendorId!)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VendorAgreement[];
    },
  });
}

/**
 * List-page variant. Fetches every vendor_agreements row in one
 * query, lets the consumer group them client-side. Used by the
 * Vendors page for the agreement-count pill.
 */
export function useAllVendorAgreements() {
  return useQuery({
    queryKey: ["vendor-agreements", "all"],
    queryFn: async (): Promise<VendorAgreement[]> => {
      const { data, error } = await supabase
        .from("vendor_agreements")
        .select("*")
        .order("vendor_id", { ascending: true })
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VendorAgreement[];
    },
  });
}

export interface VendorAgreementDraft {
  id?: string;
  category: VendorAgreement["category"];
  label: string;
  url: string;
  signed_at?: string | null;
  notes?: string | null;
  sort_order?: number;
}

/**
 * Replace the entire agreement set for one vendor. Same delete-all +
 * bulk-insert flow as useReplaceCreatorAgreements — simple, no diff
 * logic. Drafts with empty url after trim are dropped silently so the
 * dialog can hold placeholder rows during editing.
 */
export function useReplaceVendorAgreements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      vendor_id: string;
      drafts: VendorAgreementDraft[];
    }) => {
      const { vendor_id, drafts } = args;

      const inserts = drafts
        .map((d) => ({
          vendor_id,
          category: d.category,
          label: (d.label ?? "").trim() || "Agreement",
          url: (d.url ?? "").trim(),
          signed_at: d.signed_at ?? null,
          notes: (d.notes ?? "")?.trim() || null,
          sort_order: d.sort_order ?? 0,
        }))
        .filter((d) => d.url !== "");

      const { error: delErr } = await supabase
        .from("vendor_agreements")
        .delete()
        .eq("vendor_id", vendor_id);
      if (delErr) throw delErr;

      if (inserts.length > 0) {
        const { error: insErr } = await supabase
          .from("vendor_agreements")
          .insert(inserts);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["vendor-agreements", args.vendor_id] });
      qc.invalidateQueries({ queryKey: ["vendor-agreements", "all"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e) => toast.error(`Agreement save failed: ${(e as Error).message}`),
  });
}
