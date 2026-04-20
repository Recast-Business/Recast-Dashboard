import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { applyManualOverrides, computeEarnings } from "@/lib/earnings/calculate";
import type { DealComponent, ManualInputs } from "@/types/deal";
import type { PaymentStatus } from "@/types/database";

export interface CampaignCreatorRow {
  id: string;
  campaign_id: string;
  creator_id: string;
  deal_structure: DealComponent[];
  manual_inputs: ManualInputs;
  cached_earnings: number;
  cached_commission: number;
  payment_status: PaymentStatus;
  payment_due_date: string | null;
  creator: {
    id: string;
    name: string;
    twitch_handle: string | null;
    kick_handle: string | null;
    tier: string | null;
  } | null;
}

export function useCampaignCreators(campaignId: string | null) {
  return useQuery({
    queryKey: ["campaign-creators", campaignId],
    enabled: !!campaignId,
    queryFn: async (): Promise<CampaignCreatorRow[]> => {
      const { data, error } = await supabase
        .from("campaign_creators")
        .select(
          `id, campaign_id, creator_id, deal_structure, manual_inputs,
           cached_earnings, cached_commission,
           payment_status, payment_due_date,
           creator:creators!inner(id, name, twitch_handle, kick_handle, tier)`,
        )
        .eq("campaign_id", campaignId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        campaign_id: r.campaign_id,
        creator_id: r.creator_id,
        deal_structure: Array.isArray(r.deal_structure) ? r.deal_structure : [],
        manual_inputs:
          r.manual_inputs && typeof r.manual_inputs === "object"
            ? (r.manual_inputs as ManualInputs)
            : {},
        cached_earnings: Number(r.cached_earnings ?? 0),
        cached_commission: Number(r.cached_commission ?? 0),
        payment_status: r.payment_status,
        payment_due_date: r.payment_due_date,
        creator: r.creator,
      }));
    },
  });
}

export function useSaveDealStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      campaign_id: string;
      deal_structure: DealComponent[];
      commission_rate: number;
      manual_inputs?: ManualInputs;
    }) => {
      const base = computeEarnings(args.deal_structure, args.commission_rate);
      const final = applyManualOverrides(
        base,
        args.manual_inputs ?? null,
        args.commission_rate,
      );
      const { error } = await supabase
        .from("campaign_creators")
        .update({
          deal_structure: args.deal_structure as any,
          manual_inputs: (args.manual_inputs ?? {}) as any,
          cached_earnings: final.gross,
          cached_commission: final.commission,
          last_calculated_at: new Date().toISOString(),
        })
        .eq("id", args.id);
      if (error) throw error;
      return final;
    },
    onSuccess: (_res, vars) => {
      toast.success("Deal saved");
      qc.invalidateQueries({ queryKey: ["campaign-creators", vars.campaign_id] });
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e) => toast.error(`Save deal failed: ${(e as Error).message}`),
  });
}

export function useUpdatePaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      campaign_id: string;
      payment_status: PaymentStatus;
    }) => {
      const { error } = await supabase
        .from("campaign_creators")
        .update({ payment_status: args.payment_status })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      toast.success(`Payment status → ${vars.payment_status}`);
      qc.invalidateQueries({ queryKey: ["campaign-creators", vars.campaign_id] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e) => toast.error(`Status update failed: ${(e as Error).message}`),
  });
}
