import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CampaignStatus } from "@/types/database";

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  brand_id: string;
  commission_rate: number;
  payment_due_date: string | null;
  is_ad_overlay: boolean;
  type: string | null;
  brief_id: string | null;
  brief: { id: string; title: string } | null;
  brand: { id: string; name: string } | null;
  creator_count: number;
  total_earnings: number;
  total_commission: number;
}

export function useCampaigns(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["campaigns", "list"],
    enabled: opts?.enabled ?? true,
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data: campaigns, error } = await supabase
        .from("campaigns")
        .select(
          `id, name, status, brand_id, commission_rate, payment_due_date, is_ad_overlay, type, brief_id,
           brand:brands!inner(id, name),
           brief:briefs!campaigns_brief_id_fkey(id, title),
           campaign_creators(cached_earnings, cached_commission)`,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (campaigns ?? []).map((c: any) => {
        const creators = c.campaign_creators ?? [];
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          brand_id: c.brand_id,
          commission_rate: Number(c.commission_rate),
          payment_due_date: c.payment_due_date,
          is_ad_overlay: c.is_ad_overlay,
          type: c.type ?? null,
          brief_id: c.brief_id ?? null,
          brief: c.brief ?? null,
          brand: c.brand,
          creator_count: creators.length,
          total_earnings: creators.reduce(
            (s: number, cc: any) => s + Number(cc.cached_earnings ?? 0),
            0,
          ),
          total_commission: creators.reduce(
            (s: number, cc: any) => s + Number(cc.cached_commission ?? 0),
            0,
          ),
        };
      });
    },
  });
}
