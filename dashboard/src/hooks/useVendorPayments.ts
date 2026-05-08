import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { VendorPayment, PaymentStatusV2 } from "@/types/finance";

/** Fetch all payment grid rows for a single vendor in a year. */
export function useVendorPayments(vendorId: string | null, year: number) {
  return useQuery({
    queryKey: ["vendor-payments", vendorId, year],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_payments")
        .select("*")
        .eq("vendor_id", vendorId)
        .eq("period_year", year)
        .order("period_month");
      if (error) throw error;
      return (data ?? []) as VendorPayment[];
    },
  });
}

/** Fetch payment grid rows for many vendors at once. */
export function useVendorPaymentsByVendors(vendorIds: string[], year: number) {
  return useQuery({
    queryKey: ["vendor-payments", "by-vendors", vendorIds.join(","), year],
    enabled: vendorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_payments")
        .select("*")
        .in("vendor_id", vendorIds)
        .eq("period_year", year);
      if (error) throw error;
      const map: Record<string, Record<number, VendorPayment>> = {};
      for (const row of (data ?? []) as VendorPayment[]) {
        map[row.vendor_id] ??= {};
        map[row.vendor_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export interface PaymentCellInput {
  vendor_id: string;
  period_year: number;
  period_month: number;
  status: PaymentStatusV2;
  amount?: number | null;
  paid_at?: string | null;
  invoice_url?: string | null;
  notes?: string | null;
}

/**
 * Upsert a single month cell. The unique constraint on (vendor_id, year, month)
 * makes this idempotent.
 */
export function useUpsertVendorPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentCellInput) => {
      const { data, error } = await supabase
        .from("vendor_payments")
        .upsert(input, { onConflict: "vendor_id,period_year,period_month" })
        .select("*")
        .single();
      if (error) throw error;
      return data as VendorPayment;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-payments", vars.vendor_id, vars.period_year] });
      qc.invalidateQueries({ queryKey: ["vendor-payments", "by-vendors"] });
    },
  });
}
