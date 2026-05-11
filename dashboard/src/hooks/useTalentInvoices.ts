import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod, PaymentStatusV2, TalentInvoice } from "@/types/finance";

/**
 * Phase M-6: Talent Paying Us invoices.
 *
 * One invoice per (creator, year, month). Hooks mirror the
 * vendor_invoices pattern (M-4) — direct status flip via the dialog,
 * not tied into the K-3 receipt allocation engine. If/when Gustavo's
 * real-use surfaces a need for partial-payment FIFO across talent
 * invoices, M-6b can wire payment_receipts.talent_invoice_id.
 */

export function useTalentInvoicesByYear(year: number) {
  return useQuery({
    queryKey: ["talent-invoices", "by-year", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_invoices")
        .select("*")
        .eq("period_year", year)
        .order("period_month");
      if (error) throw error;
      // Index by creator_id → month → invoice for grid rendering.
      const map: Record<string, Record<number, TalentInvoice>> = {};
      for (const row of (data ?? []) as TalentInvoice[]) {
        map[row.creator_id] ??= {};
        map[row.creator_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export function useTalentInvoicesByCreator(creatorId: string | null) {
  return useQuery({
    queryKey: ["talent-invoices", "by-creator", creatorId],
    enabled: !!creatorId,
    queryFn: async (): Promise<TalentInvoice[]> => {
      if (!creatorId) return [];
      const { data, error } = await supabase
        .from("talent_invoices")
        .select("*")
        .eq("creator_id", creatorId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalentInvoice[];
    },
  });
}

/** All overdue talent invoices joined to creator name — for the
 *  OverdueDrawer at the top of /finance. */
export function useAllOverdueTalentInvoices() {
  return useQuery({
    queryKey: ["talent-invoices", "overdue-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_invoices")
        .select("*, creator:creators(name)")
        .eq("status", "overdue")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────

export interface TalentInvoiceInput {
  creator_id: string;
  period_year: number;
  period_month: number;
  invoice_number?: string | null;
  amount: number;
  due_date: string;
  invoice_url?: string | null;
  notes?: string | null;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["talent-invoices"] });
  qc.invalidateQueries({ queryKey: ["overdue-rows"] });
  qc.invalidateQueries({ queryKey: ["finance-overview"] });
}

export function useAddTalentInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TalentInvoiceInput): Promise<TalentInvoice> => {
      const { data, error } = await supabase
        .from("talent_invoices")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as TalentInvoice;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateTalentInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<TalentInvoiceInput> }) => {
      const { data, error } = await supabase
        .from("talent_invoices")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as TalentInvoice;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteTalentInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("talent_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Mark Paid / Reopen / Mark Partial — direct status flip with
 *  bookkeeping of paid_at + amount_paid + payment metadata. */
export function useSetTalentInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      status: PaymentStatusV2;
      amount_paid?: number;
      paid_at?: string | null;
      payment_method?: PaymentMethod | null;
      payment_reference?: string | null;
    }) => {
      const patch: Record<string, unknown> = { status: args.status };
      if (args.status === "paid") {
        patch.paid_at = args.paid_at ?? new Date().toISOString().slice(0, 10);
      } else if (args.status === "unpaid") {
        patch.paid_at = null;
        patch.amount_paid = 0;
      }
      if (args.amount_paid !== undefined) patch.amount_paid = args.amount_paid;
      if (args.payment_method !== undefined) patch.payment_method = args.payment_method;
      if (args.payment_reference !== undefined)
        patch.payment_reference = args.payment_reference;
      const { data, error } = await supabase
        .from("talent_invoices")
        .update(patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as TalentInvoice;
    },
    onSuccess: () => invalidate(qc),
  });
}
