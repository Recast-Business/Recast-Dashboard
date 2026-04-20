import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { CampaignStatus } from "@/types/database";

export function useBrands() {
  return useQuery({
    queryKey: ["brands", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      brand_name: string;
      campaign_name: string;
      commission_rate: number;
      is_ad_overlay?: boolean;
      type?: string | null;
    }) => {
      const { data: existing } = await supabase
        .from("brands")
        .select("id")
        .ilike("name", args.brand_name)
        .maybeSingle();

      let brandId = existing?.id;
      if (!brandId) {
        const { data: created, error } = await supabase
          .from("brands")
          .insert({ name: args.brand_name })
          .select("id")
          .single();
        if (error) throw error;
        brandId = created.id;
      }

      const { data: campaign, error: ce } = await supabase
        .from("campaigns")
        .insert({
          brand_id: brandId,
          name: args.campaign_name,
          status: "active",
          commission_rate: args.commission_rate,
          is_ad_overlay: args.is_ad_overlay ?? false,
          type: args.type?.trim() || null,
        })
        .select("id")
        .single();
      if (ce) throw ce;
      return campaign.id;
    },
    onSuccess: () => {
      toast.success("Campaign created");
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      qc.invalidateQueries({ queryKey: ["brands", "list"] });
    },
    onError: (e) => toast.error(`Create failed: ${(e as Error).message}`),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      brand_name: string;
      campaign_name: string;
      commission_rate: number;
      is_ad_overlay: boolean;
      type: string | null;
      status: CampaignStatus;
    }) => {
      const { data: existing } = await supabase
        .from("brands")
        .select("id")
        .ilike("name", args.brand_name)
        .maybeSingle();

      let brandId = existing?.id;
      if (!brandId) {
        const { data: created, error } = await supabase
          .from("brands")
          .insert({ name: args.brand_name })
          .select("id")
          .single();
        if (error) throw error;
        brandId = created.id;
      }

      const { error: ue } = await supabase
        .from("campaigns")
        .update({
          brand_id: brandId,
          name: args.campaign_name,
          commission_rate: args.commission_rate,
          is_ad_overlay: args.is_ad_overlay,
          type: args.type?.trim() || null,
          status: args.status,
        })
        .eq("id", args.id);
      if (ue) throw ue;
    },
    onSuccess: () => {
      toast.success("Campaign updated");
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      qc.invalidateQueries({ queryKey: ["brands", "list"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["campaign-creators"] });
    },
    onError: (e) => toast.error(`Update failed: ${(e as Error).message}`),
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
      toast.success("Campaign deleted");
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
  });
}
