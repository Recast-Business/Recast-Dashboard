import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CampaignStatusV2, CampaignV2 } from "@/types/finance";

/**
 * NOTE: this file replaces the legacy hook of the same name. The old version
 * targeted the pre-Phase-A schema (`commission_rate`, `brand_id` FK). The new
 * schema is `default_commission_pct`, free-text `brand`, plus `campaign_type`,
 * `brief_id`, etc. — all reflected in CampaignV2 in types/finance.
 * (0049: is_ad_overlay dropped — campaign_type === "Ad Overlay" is the
 * single source of truth, with cpm_rate + ad_frequency_per_hr columns
 * carrying the rate card.)
 */

export interface CampaignFilter {
  status?: CampaignStatusV2;
  /** Substring match on name OR brand. */
  search?: string;
}

export function useCampaigns(filter: CampaignFilter = {}) {
  return useQuery({
    queryKey: ["campaigns", "v2", "list", filter.status ?? "all", filter.search ?? ""],
    queryFn: async () => {
      let q = supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (filter.status) q = q.eq("status", filter.status);
      const { data, error } = await q;
      if (error) throw error;

      let rows = (data ?? []) as CampaignV2[];
      const s = filter.search?.trim().toLowerCase();
      if (s) {
        rows = rows.filter(
          (c) => c.name.toLowerCase().includes(s) || c.brand.toLowerCase().includes(s),
        );
      }
      return rows;
    },
  });
}

export interface CampaignInput {
  name: string;
  brand: string;
  campaign_type?: string | null;
  status?: CampaignStatusV2;
  default_commission_pct: number;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  /** R5 Sweep 1 (Gustavo, T2): deliverables count replaces end-date as
   *  the "how much work" signal. */
  deliverables_count?: number | null;
  /** Ad Overlay deals: campaign-level rate card. Set when
   *  campaign_type === "Ad Overlay". */
  cpm_rate?: number | null;
  ad_frequency_per_hr?: number | null;
  notes?: string | null;
}

export function useAddCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CampaignInput) => {
      const { data, error } = await supabase
        .from("campaigns")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as CampaignV2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns", "v2"] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<CampaignInput> }) => {
      const { data, error } = await supabase
        .from("campaigns")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as CampaignV2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns", "v2"] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", "v2"] });
      qc.invalidateQueries({ queryKey: ["campaign-creators", "v2"] });
      qc.invalidateQueries({ queryKey: ["campaign-payments"] });
    },
  });
}
