import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Vendor, VendorKind, Division, PaymentMethod } from "@/types/finance";

export interface VendorFilter {
  division?: Division | null;
  kind?: VendorKind;
}

export function useVendors(filter: VendorFilter = {}) {
  return useQuery({
    queryKey: ["vendors", "list", filter.division ?? "all", filter.kind ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("vendors")
        .select("*")
        .order("name");
      if (filter.division !== undefined) {
        if (filter.division === null) q = q.is("division", null);
        else q = q.eq("division", filter.division);
      }
      if (filter.kind) q = q.eq("kind", filter.kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });
}

/** Fetch a single vendor by id — drives the C4b detail page. */
export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: ["vendors", "single", id],
    enabled: !!id,
    queryFn: async (): Promise<Vendor> => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Vendor;
    },
  });
}

export interface VendorInput {
  name: string;
  kind: VendorKind;
  division?: Division | null;
  payment_method?: PaymentMethod | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  account_profile?: string | null;
  notes?: string | null;
  active?: boolean;
  // Phase M-1: roster fields
  username_handle?: string | null;
  nda_signed?: boolean;
  nda_url?: string | null;
  // R5 Sweep 1: vendor.service_provided dropped via 0041
  // Round 4 (0037): opt-in recurring monthly bill
  recurring_monthly?: boolean;
  recurring_amount?: number | null;
  // Round 4 B (0039): tax tracker opt-in + W9
  requires_tax_info?: boolean;
  w9_url?: string | null;
  w9_received_at?: string | null;
  // R5 Sweep 2 (0042): multi-platform handles
  socials?: Record<string, string>;
}

export function useAddVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VendorInput) => {
      const { data, error } = await supabase
        .from("vendors")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as Vendor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<VendorInput> }) => {
      const { data, error } = await supabase
        .from("vendors")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Vendor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-payments"] });
    },
  });
}
