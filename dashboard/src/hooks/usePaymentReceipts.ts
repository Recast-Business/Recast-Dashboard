import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

/**
 * R5 follow-up — edit an existing receipt.
 *
 * Two semantics depending on what changed:
 *
 *   • Metadata only (received_at / method / reference / notes) →
 *     plain UPDATE. Allocations untouched. The cascading status
 *     trigger doesn't fire because amount_paid on the obligor rows
 *     didn't change.
 *
 *   • Amount changed → UPDATE the receipt, then DELETE every
 *     existing payment_allocations row for this receipt (which
 *     fires the reconcile trigger to back out the prior amount_paid
 *     attribution), then call allocate_fifo to re-spread the new
 *     amount across the obligor's oldest unpaid periods.
 *
 * Not transactionally atomic across the three steps. A mid-flight
 * failure leaves the receipt updated but unallocated; the toast
 * surfaces the error and the user can re-save to trigger
 * re-allocation. Promote to a single SQL RPC if/when that becomes
 * a real problem.
 */
interface EditReceiptInput {
  id: string;
  source: PaymentSource;
  /** Original receipt amount — used to decide whether re-allocation
   *  is needed. The mutation does the comparison itself. */
  originalAmount: number;
  received_at: string;
  amount: number;
  method?: PaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
}

export function useEditReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditReceiptInput) => {
      const amountChanged =
        Math.round((Number(input.amount) || 0) * 100) !==
        Math.round((Number(input.originalAmount) || 0) * 100);

      // 1. UPDATE the receipt row itself.
      const { error: updErr } = await supabase
        .from("payment_receipts")
        .update({
          received_at: input.received_at,
          amount: input.amount,
          method: input.method ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        })
        .eq("id", input.id);
      if (updErr) throw updErr;

      // 2. If amount changed, wipe old allocations + re-allocate.
      //    The cascade via the reconcile_period_status trigger will
      //    drop the old amount_paid attribution on every affected
      //    obligor row before the new allocate_fifo lands.
      if (amountChanged) {
        const { error: delAllocErr } = await supabase
          .from("payment_allocations")
          .delete()
          .eq("receipt_id", input.id);
        if (delAllocErr) throw delAllocErr;
        const { error: rpcErr } = await supabase.rpc("allocate_fifo", {
          p_receipt_id: input.id,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: (_data, vars) => invalidateForSource(qc, vars.source),
    onError: (e) => toast.error(`Edit receipt failed: ${(e as Error).message}`),
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

/**
 * R5 follow-up (Gus #8) — the unified House payment log on /house.
 *
 * Pulls BOTH house_rent and house_utility receipts for the year so
 * the dedicated panel can show every household receipt in one place
 * (the global /payments page no longer carries house sources).
 * Resident + utility join shapes are normalised so the consumer
 * doesn't have to branch on source.
 */
export function useHouseAllReceipts(year: number) {
  return useQuery({
    queryKey: ["payment-receipts", "house_all", year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("payment_receipts")
        .select(
          `*,
           allocations:payment_allocations(*),
           resident:house_residents(id, name, rent_group_id),
           utility:house_utilities(id, utility_name)`,
        )
        .in("source", ["house_rent", "house_utility"])
        .gte("received_at", start)
        .lte("received_at", end)
        .order("received_at", { ascending: false });
      if (error) throw error;
      // Supabase nested-to-one selects can return arrays; normalise.
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        resident: Array.isArray(r.resident) ? r.resident[0] ?? null : r.resident ?? null,
        utility: Array.isArray(r.utility) ? r.utility[0] ?? null : r.utility ?? null,
      }));
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

// ─────────────────────────────────────────────────────────────────────
// R5 Sweep 5 — global /payments page
// ─────────────────────────────────────────────────────────────────────

/**
 * Polymorphic obligor join row — only the field matching the receipt's
 * `source` is populated. Resolved client-side to a single display name
 * + a link target.
 */
export interface ReceiptWithJoins extends PaymentReceipt {
  allocations: PaymentAllocation[];
  vendor: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
  resident: { id: string; name: string } | null;
  utility: { id: string; utility_name: string } | null;
  of_deal: { id: string; page_name: string; creator: { id: string; name: string } | null } | null;
  campaign_creator: {
    id: string;
    campaign: { id: string; name: string; brand: string | null } | null;
    creator: { id: string; name: string } | null;
  } | null;
}

/**
 * All payment receipts in the year, newest first, joined to every
 * obligor table so the page can render a unified table without N+1
 * lookups. Optional source filter narrows server-side; search runs
 * client-side because it spans joined names.
 */
export function useAllPaymentReceipts(args: {
  year: number;
  sources?: PaymentSource[]; // empty / undefined = all
}) {
  return useQuery({
    queryKey: ["payment-receipts", "all", args.year, args.sources ?? "*"],
    queryFn: async (): Promise<ReceiptWithJoins[]> => {
      const start = `${args.year}-01-01`;
      const end = `${args.year}-12-31`;
      let q = supabase
        .from("payment_receipts")
        .select(
          `*,
           allocations:payment_allocations(*),
           vendor:vendors(id, name),
           creator:creators(id, name),
           resident:house_residents(id, name),
           utility:house_utilities(id, utility_name),
           of_deal:of_deals(id, page_name, creator:creators(id, name)),
           campaign_creator:campaign_creators(
             id,
             campaign:campaigns(id, name, brand),
             creator:creators(id, name)
           )`,
        )
        .gte("received_at", start)
        .lte("received_at", end)
        .order("received_at", { ascending: false });
      if (args.sources && args.sources.length > 0) {
        q = q.in("source", args.sources);
      }
      const { data, error } = await q;
      if (error) throw error;
      // Supabase nested-select returns to-one joins as arrays even when
      // the FK is many-to-one. Normalise so the page can read .vendor
      // directly. Same trick we use in useCreatorPerformance for the
      // campaign join.
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        vendor: Array.isArray(r.vendor) ? r.vendor[0] ?? null : r.vendor ?? null,
        creator: Array.isArray(r.creator) ? r.creator[0] ?? null : r.creator ?? null,
        resident: Array.isArray(r.resident) ? r.resident[0] ?? null : r.resident ?? null,
        utility: Array.isArray(r.utility) ? r.utility[0] ?? null : r.utility ?? null,
        of_deal: (() => {
          const od = Array.isArray(r.of_deal) ? r.of_deal[0] : r.of_deal;
          if (!od) return null;
          const c = Array.isArray(od.creator) ? od.creator[0] : od.creator;
          return { ...od, creator: c ?? null };
        })(),
        campaign_creator: (() => {
          const cc = Array.isArray(r.campaign_creator) ? r.campaign_creator[0] : r.campaign_creator;
          if (!cc) return null;
          const camp = Array.isArray(cc.campaign) ? cc.campaign[0] : cc.campaign;
          const cr = Array.isArray(cc.creator) ? cc.creator[0] : cc.creator;
          return { ...cc, campaign: camp ?? null, creator: cr ?? null };
        })(),
      })) as ReceiptWithJoins[];
    },
  });
}
