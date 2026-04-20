import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export interface PaymentRow {
  id: string;
  campaign_creator_id: string;
  amount: number;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
}

export function usePayments(campaignCreatorId: string | null) {
  return useQuery({
    queryKey: ["payments", campaignCreatorId],
    enabled: !!campaignCreatorId,
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, campaign_creator_id, amount, paid_at, period_start, period_end, notes")
        .eq("campaign_creator_id", campaignCreatorId!)
        .order("paid_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        campaign_creator_id: r.campaign_creator_id,
        amount: Number(r.amount ?? 0),
        paid_at: r.paid_at,
        period_start: r.period_start,
        period_end: r.period_end,
        notes: r.notes,
      }));
    },
  });
}

export function useLogPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      campaign_creator_id: string;
      campaign_id: string;
      amount: number;
      paid_at: string;
      period_start?: string | null;
      period_end?: string | null;
      notes?: string | null;
      mark_paid: boolean;
    }) => {
      const { error: pe } = await supabase.from("payments").insert({
        campaign_creator_id: args.campaign_creator_id,
        amount: args.amount,
        paid_at: args.paid_at,
        period_start: args.period_start ?? null,
        period_end: args.period_end ?? null,
        notes: args.notes ?? null,
      });
      if (pe) throw pe;

      if (args.mark_paid) {
        const { error: ue } = await supabase
          .from("campaign_creators")
          .update({ payment_status: "paid" })
          .eq("id", args.campaign_creator_id);
        if (ue) throw ue;
      }
    },
    onSuccess: (_r, vars) => {
      toast.success("Payment logged");
      qc.invalidateQueries({ queryKey: ["payments", vars.campaign_creator_id] });
      qc.invalidateQueries({ queryKey: ["campaign-creators", vars.campaign_id] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(`Log payment failed: ${(e as Error).message}`),
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; campaign_creator_id: string; campaign_id: string }) => {
      const { error } = await supabase.from("payments").delete().eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      toast.success("Payment deleted");
      qc.invalidateQueries({ queryKey: ["payments", vars.campaign_creator_id] });
      qc.invalidateQueries({ queryKey: ["campaign-creators", vars.campaign_id] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e) => toast.error(`Delete payment failed: ${(e as Error).message}`),
  });
}
