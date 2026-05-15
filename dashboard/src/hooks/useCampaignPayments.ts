import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CampaignPayment } from "@/types/finance";

/**
 * Per-month payment grid for a single campaign creator.
 * One row per (campaign_creator_id, year, month).
 */

export function useCampaignPayments(campaignCreatorId: string | null, year: number) {
  return useQuery({
    queryKey: ["campaign-payments", campaignCreatorId, year],
    enabled: !!campaignCreatorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_payments")
        .select("*")
        .eq("campaign_creator_id", campaignCreatorId)
        .eq("period_year", year)
        .order("period_month");
      if (error) throw error;
      return (data ?? []) as CampaignPayment[];
    },
  });
}

/** Bulk fetch for many campaign-creators in one year, indexed [ccId][month] = row. */
export function useCampaignPaymentsByCreators(campaignCreatorIds: string[], year: number) {
  return useQuery({
    queryKey: ["campaign-payments", "by-cc", campaignCreatorIds.join(","), year],
    enabled: campaignCreatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_payments")
        .select("*")
        .in("campaign_creator_id", campaignCreatorIds)
        .eq("period_year", year);
      if (error) throw error;
      const map: Record<string, Record<number, CampaignPayment>> = {};
      for (const row of (data ?? []) as CampaignPayment[]) {
        map[row.campaign_creator_id] ??= {};
        map[row.campaign_creator_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export interface CampaignPaymentInput {
  campaign_creator_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  invoice_url?: string | null;
  notes?: string | null;
  /** Ad Overlay deals: per-creator-per-month inputs that drove this
   *  amount. Persisted so the period dialog can show them back next
   *  time the cell is opened. Null on other deal types. */
  ccv?: number | null;
  airtime_minutes?: number | null;
}

export function useUpsertCampaignPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CampaignPaymentInput) => {
      // status + paid_at intentionally omitted — effective status is
      // derived from amount_paid + period EOM via effectiveInvoiceStatus.
      // Omitting them means INSERT uses the DB defaults; UPDATE leaves
      // existing values untouched (Supabase upsert only SETs columns
      // present on the inserted row).
      const { data, error } = await supabase
        .from("campaign_payments")
        .upsert(
          {
            campaign_creator_id: input.campaign_creator_id,
            period_year: input.period_year,
            period_month: input.period_month,
            amount: input.amount,
            invoice_url: input.invoice_url ?? null,
            notes: input.notes ?? null,
            ccv: input.ccv ?? null,
            airtime_minutes: input.airtime_minutes ?? null,
          },
          { onConflict: "campaign_creator_id,period_year,period_month" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data as CampaignPayment;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({
        queryKey: ["campaign-payments", vars.campaign_creator_id, vars.period_year],
      });
      qc.invalidateQueries({ queryKey: ["campaign-payments", "by-cc"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
    },
  });
}
