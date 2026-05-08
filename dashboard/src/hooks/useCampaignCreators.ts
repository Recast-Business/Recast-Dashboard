import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { calcCampaignDeal, type DealType } from "@/lib/finance/campaign-calc";
import type { CampaignCreatorV2 } from "@/types/finance";

/**
 * Replaces the legacy hook of the same name. The old hook used the
 * pre-Phase-A `deal_components` JSON model and the now-deleted
 * `applyManualOverrides` earnings engine. The new model is one row per
 * (campaign, creator) with deal_type + per-creator commission override.
 */

export interface CampaignCreatorRow extends CampaignCreatorV2 {
  creator?: { id: string; name: string } | null;
}

export function useCampaignCreators(campaignId: string | null) {
  return useQuery({
    queryKey: ["campaign-creators", "v2", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_creators")
        .select("*, creator:creators(id, name)")
        .eq("campaign_id", campaignId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CampaignCreatorRow[];
    },
  });
}

export interface CampaignCreatorInput {
  campaign_id: string;
  creator_id: string;
  /** null = inherit campaign default. */
  commission_pct: number | null;
  start_date: string | null;
  end_date: string | null;
  deal_type: DealType;
  cpm_rate: number | null;
  flat_amount: number | null;
  notes?: string | null;
}

export function useAddCampaignCreator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CampaignCreatorInput) => {
      const { data, error } = await supabase
        .from("campaign_creators")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as CampaignCreatorV2;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["campaign-creators", "v2", vars.campaign_id] });
    },
  });
}

export function useUpdateCampaignCreator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<CampaignCreatorInput> }) => {
      const { data, error } = await supabase
        .from("campaign_creators")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as CampaignCreatorV2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-creators", "v2"] }),
  });
}

export function useDeleteCampaignCreator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaign_creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-creators", "v2"] });
      qc.invalidateQueries({ queryKey: ["campaign-payments"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Per-month performance (views / clicks / etc) lives on campaign_creators
// itself as the running totals, but each month's *delta* is stored on the
// campaign_payment row. The cell editor takes views/clicks for a specific
// month, calls calcCampaignDeal client-side, and writes both the period
// row (with that month's gross) and the rolled-up cached totals on
// campaign_creators.
// ─────────────────────────────────────────────────────────────────────

export interface CampaignCreatorMetricsUpdate {
  id: string;
  views: number | null;
  displays: number | null;
  clicks: number | null;
  /** Optional: pre-computed CTR; if omitted, derived from clicks/views. */
  ctr_pct?: number | null;
  /** Pass through deal terms so we can refresh cached_earnings/cached_commission. */
  deal_type: DealType;
  cpm_rate: number | null;
  flat_amount: number | null;
  override_commission_pct: number | null;
  default_commission_pct: number;
}

export function useUpdateCampaignCreatorMetrics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CampaignCreatorMetricsUpdate) => {
      const calc = calcCampaignDeal({
        deal_type: input.deal_type,
        cpm_rate: input.cpm_rate,
        flat_amount: input.flat_amount,
        views: input.views,
        displays: input.displays,
        clicks: input.clicks,
        override_commission_pct: input.override_commission_pct,
        default_commission_pct: input.default_commission_pct,
      });
      const { data, error } = await supabase
        .from("campaign_creators")
        .update({
          views: input.views,
          displays: input.displays,
          clicks: input.clicks,
          ctr_pct: input.ctr_pct ?? calc.ctr_pct,
          cached_earnings: calc.gross,
          cached_commission: calc.recast_commission,
          last_calculated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return { row: data as CampaignCreatorV2, calc };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-creators", "v2"] }),
  });
}
