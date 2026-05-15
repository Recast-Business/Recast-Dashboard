import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod, PaymentStatusV2, VendorInvoice } from "@/types/finance";

/**
 * Phase K-4: ad-hoc vendor invoices.
 *
 * Each invoice is independent of the recurring (vendor, year, month)
 * monthly grid. They flip paid/overdue via direct status updates;
 * not tied to the K-3 receipt allocation engine.
 */

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

/** All invoices for one vendor, newest-issued first. */
export function useVendorInvoices(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-invoices", vendorId],
    enabled: !!vendorId,
    queryFn: async (): Promise<VendorInvoice[]> => {
      if (!vendorId) return [];
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VendorInvoice[];
    },
  });
}

/** All invoices across all vendors — used by OverdueDrawer. */
export function useAllOverdueInvoices() {
  return useQuery({
    queryKey: ["vendor-invoices", "overdue-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*, vendor:vendors(name)")
        .eq("status", "overdue")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Phase: Bruno separation — cross-vendor invoice list for the
 *  Vendor Invoices tab on /finance. Joined with vendor name + kind so
 *  the table can render the vendor alongside each invoice. */
export interface VendorInvoiceWithVendor extends VendorInvoice {
  vendor: { id: string; name: string; kind: string } | null;
}

export function useAllVendorInvoices(year: number) {
  return useQuery({
    queryKey: ["vendor-invoices", "all", year],
    queryFn: async (): Promise<VendorInvoiceWithVendor[]> => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*, vendor:vendors(id, name, kind)")
        .gte("issued_at", yearStart)
        .lte("issued_at", yearEnd)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VendorInvoiceWithVendor[];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────

export interface VendorInvoiceInput {
  vendor_id: string;
  description: string;
  issued_at: string;
  due_date: string;
  amount: number;
  invoice_url?: string | null;
  notes?: string | null;
}

export function useAddVendorInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VendorInvoiceInput): Promise<VendorInvoice> => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as VendorInvoice;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-invoices", vars.vendor_id] });
      qc.invalidateQueries({ queryKey: ["vendor-invoices", "overdue-all"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
    },
  });
}

export function useUpdateVendorInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; vendor_id: string; patch: Partial<VendorInvoiceInput> }) => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as VendorInvoice;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-invoices", vars.vendor_id] });
      qc.invalidateQueries({ queryKey: ["vendor-invoices", "overdue-all"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
    },
  });
}

export function useDeleteVendorInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; vendor_id: string }) => {
      const { error } = await supabase.from("vendor_invoices").delete().eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-invoices", vars.vendor_id] });
      qc.invalidateQueries({ queryKey: ["vendor-invoices", "overdue-all"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
    },
  });
}

/** Flip an invoice's status (paid/unpaid/partial/overdue) and record
 *  the payment metadata in one shot. Used by the "Mark paid" button. */
export function useSetInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      vendor_id: string;
      status: PaymentStatusV2;
      paid_at?: string | null;
      payment_method?: PaymentMethod | null;
      payment_reference?: string | null;
    }) => {
      const patch: Record<string, unknown> = { status: args.status };
      patch.paid_at =
        args.status === "paid"
          ? args.paid_at ?? new Date().toISOString().slice(0, 10)
          : null;
      if (args.payment_method !== undefined) patch.payment_method = args.payment_method;
      if (args.payment_reference !== undefined) patch.payment_reference = args.payment_reference;
      const { data, error } = await supabase
        .from("vendor_invoices")
        .update(patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as VendorInvoice;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-invoices", vars.vendor_id] });
      qc.invalidateQueries({ queryKey: ["vendor-invoices", "overdue-all"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
    },
  });
}
