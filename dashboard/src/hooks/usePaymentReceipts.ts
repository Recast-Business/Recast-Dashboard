import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  PaymentAllocation,
  PaymentMethod,
  PaymentReceipt,
  PaymentSource,
} from "@/types/finance";

/**
 * Phase K-3 client wrapper around payment_receipts + payment_allocations.
 *
 * The server keeps amount_paid + status in sync via the reconcile_period_status
 * trigger, so on any successful mutation we just need to invalidate the
 * downstream queries (house, vendor_payments, tele/of perf, finance summary,
 * overdue drawer) and the UI updates itself.
 */

// ─────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────

interface BaseReceiptInput {
  received_at: string; // ISO yyyy-mm-dd
  amount: number;
  method?: PaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
}

export type ReceiptInput =
  | (BaseReceiptInput & { source: "vendor"; vendor_id: string })
  | (BaseReceiptInput & { source: "campaign"; campaign_creator_id: string })
  | (BaseReceiptInput & { source: "telegram"; creator_id: string })
  | (BaseReceiptInput & { source: "onlyfans"; of_deal_id: string })
  | (BaseReceiptInput & { source: "house_rent"; resident_id: string })
  | (BaseReceiptInput & { source: "house_utility"; utility_id: string });

interface SpecificAllocation {
  period_year: number;
  period_month: number;
  amount: number;
}

// Touched cache keys per source — keeps invalidation tight enough to be
// useful but loose enough that a House receipt always refreshes the
// House panels, etc.
function invalidateForSource(qc: ReturnType<typeof useQueryClient>, source: PaymentSource) {
  qc.invalidateQueries({ queryKey: ["payment-receipts"] });
  qc.invalidateQueries({ queryKey: ["overdue-rows"] });
  qc.invalidateQueries({ queryKey: ["finance-summary"] });
  switch (source) {
    case "house_rent":
    case "house_utility":
      qc.invalidateQueries({ queryKey: ["house"] });
      break;
    case "vendor":
      qc.invalidateQueries({ queryKey: ["vendor-payments"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
      break;
    case "telegram":
      qc.invalidateQueries({ queryKey: ["tele-period-performance"] });
      qc.invalidateQueries({ queryKey: ["tele-deals"] });
      break;
    case "onlyfans":
      qc.invalidateQueries({ queryKey: ["of-period-performance"] });
      qc.invalidateQueries({ queryKey: ["of-deals"] });
      break;
    case "campaign":
      qc.invalidateQueries({ queryKey: ["campaign-payments"] });
      qc.invalidateQueries({ queryKey: ["campaign-creators"] });
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────

/** Insert a receipt and let the server FIFO-allocate it across the obligor's
 *  oldest unpaid/partial/overdue periods. Default for House + Vendor. */
export function useLogReceiptFifo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReceiptInput): Promise<PaymentReceipt> => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      const receipt = data as PaymentReceipt;
      const { error: rpcError } = await supabase.rpc("allocate_fifo", {
        p_receipt_id: receipt.id,
      });
      if (rpcError) throw rpcError;
      return receipt;
    },
    onSuccess: (_data, vars) => invalidateForSource(qc, vars.source),
  });
}

/** Insert a receipt and allocate specific (year, month, amount) splits.
 *  Used by Talent receipts where the user picks the target month explicitly. */
export function useLogReceiptSpecific() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      receipt: ReceiptInput;
      allocations: SpecificAllocation[];
    }): Promise<PaymentReceipt> => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .insert(args.receipt)
        .select("*")
        .single();
      if (error) throw error;
      const receipt = data as PaymentReceipt;
      for (const alloc of args.allocations) {
        const { error: rpcError } = await supabase.rpc("allocate_specific", {
          p_receipt_id: receipt.id,
          p_year: alloc.period_year,
          p_month: alloc.period_month,
          p_amount: alloc.amount,
        });
        if (rpcError) throw rpcError;
      }
      return receipt;
    },
    onSuccess: (_data, vars) => invalidateForSource(qc, vars.receipt.source),
  });
}

/** Delete a receipt — cascades to its allocations, which fire the
 *  reconcile trigger to back out the status changes on each affected row. */
export function useDeleteReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; source: PaymentSource }) => {
      const { error } = await supabase
        .from("payment_receipts")
        .delete()
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateForSource(qc, vars.source),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

interface ObligorRef {
  source: PaymentSource;
  vendor_id?: string;
  campaign_creator_id?: string;
  creator_id?: string;
  of_deal_id?: string;
  resident_id?: string;
  utility_id?: string;
}

/** Phase M-3: All house-rent receipts in the year, newest first, joined to
 *  resident name. Drives the per-person payment history panel. */
export function useHouseRentReceipts(year: number) {
  return useQuery({
    queryKey: ["payment-receipts", "house_rent", year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("payment_receipts")
        .select("*, allocations:payment_allocations(*), resident:house_residents(id, name, rent_group_id)")
        .eq("source", "house_rent")
        .gte("received_at", start)
        .lte("received_at", end)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Receipts for one specific obligor — newest first. Pass `enabled=false`
 *  to skip the query when the dialog is closed. */
export function useReceiptsForObligor(ref: ObligorRef | null, enabled = true) {
  return useQuery({
    queryKey: ["payment-receipts", "obligor", ref],
    enabled: enabled && !!ref,
    queryFn: async (): Promise<(PaymentReceipt & { allocations: PaymentAllocation[] })[]> => {
      if (!ref) return [];
      let q = supabase
        .from("payment_receipts")
        .select("*, allocations:payment_allocations(*)")
        .eq("source", ref.source)
        .order("received_at", { ascending: false });
      if (ref.vendor_id) q = q.eq("vendor_id", ref.vendor_id);
      if (ref.campaign_creator_id) q = q.eq("campaign_creator_id", ref.campaign_creator_id);
      if (ref.creator_id) q = q.eq("creator_id", ref.creator_id);
      if (ref.of_deal_id) q = q.eq("of_deal_id", ref.of_deal_id);
      if (ref.resident_id) q = q.eq("resident_id", ref.resident_id);
      if (ref.utility_id) q = q.eq("utility_id", ref.utility_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (PaymentReceipt & { allocations: PaymentAllocation[] })[];
    },
  });
}
