import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { calcOFPeriod, type CommissionMode, type CommissionTier } from "@/lib/finance/calc";
import type {
  CommissionBasis,
  OFDeal,
  OFPeriodPerformance,
  PaymentStatusV2,
} from "@/types/finance";

export interface OFDealRow extends OFDeal {
  creator?: {
    id: string;
    name: string;
    commission_pct_by_platform?: Record<string, unknown> | null;
    /** R3 Q1+Q7 (migration 0035): canonical tier column. */
    commission_tiers?: Record<string, unknown> | null;
    /** R3 Q1: legacy cliff math toggle. */
    commission_uses_cliff?: boolean | null;
  } | null;
}

export function useOFDeals(opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["of-deals", "list", !!opts.includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("of_deals")
        .select("*, creator:creators(id, name, commission_pct_by_platform, commission_tiers, commission_uses_cliff)")
        .order("created_at", { ascending: false });
      if (!opts.includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OFDealRow[];
    },
  });
}

export interface OFDealInput {
  creator_id: string;
  page_name: string;
  recast_pct: number;
  basis: CommissionBasis;
  active?: boolean;
  notes?: string | null;
}

export function useAddOFDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OFDealInput) => {
      const { data, error } = await supabase
        .from("of_deals")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as OFDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["of-deals"] }),
  });
}

export function useUpdateOFDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<OFDealInput> }) => {
      const { data, error } = await supabase
        .from("of_deals")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as OFDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["of-deals"] }),
  });
}

export function useDeleteOFDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("of_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["of-deals"] });
      qc.invalidateQueries({ queryKey: ["of-period"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Performance grid
// ─────────────────────────────────────────────────────────────────────

export function useOFPeriods(dealId: string | null, year: number) {
  return useQuery({
    queryKey: ["of-period", dealId, year],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("of_period_performance")
        .select("*")
        .eq("of_deal_id", dealId)
        .eq("period_year", year)
        .order("period_month");
      if (error) throw error;
      return (data ?? []) as OFPeriodPerformance[];
    },
  });
}

export function useOFPeriodsByDeals(dealIds: string[], year: number) {
  return useQuery({
    queryKey: ["of-period", "by-deals", dealIds.join(","), year],
    enabled: dealIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("of_period_performance")
        .select("*")
        .in("of_deal_id", dealIds)
        .eq("period_year", year);
      if (error) throw error;
      const map: Record<string, Record<number, OFPeriodPerformance>> = {};
      for (const row of (data ?? []) as OFPeriodPerformance[]) {
        map[row.of_deal_id] ??= {};
        map[row.of_deal_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export interface OFPeriodInput {
  of_deal_id: string;
  period_year: number;
  period_month: number;
  gross_revenue: number;
  net_revenue?: number;
  status?: PaymentStatusV2;
  paid_at?: string | null;
  notes?: string | null;
  // Deal economics for client-side calc:
  recast_pct: number;
  basis: CommissionBasis;
  /** Phase K-2: optional tiered commission table from the creator's profile. */
  tiers?: CommissionTier[] | null;
  /** R3 Q1+Q7 (migration 0035): commission math mode. */
  commissionMode?: CommissionMode;
}

export function useUpsertOFPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OFPeriodInput) => {
      const calc = calcOFPeriod({
        gross_revenue: input.gross_revenue,
        net_revenue: input.net_revenue,
        recast_pct: input.recast_pct,
        basis: input.basis,
        tiers: input.tiers,
        commissionMode: input.commissionMode,
      });
      const row = {
        of_deal_id: input.of_deal_id,
        period_year: input.period_year,
        period_month: input.period_month,
        gross_revenue: calc.gross_revenue,
        net_revenue: calc.net_revenue,
        recast_commission: calc.recast_commission,
        girls_share: calc.girls_share,
        status: input.status ?? "unpaid",
        paid_at: input.paid_at ?? null,
        notes: input.notes ?? null,
      };
      const { data, error } = await supabase
        .from("of_period_performance")
        .upsert(row, { onConflict: "of_deal_id,period_year,period_month" })
        .select("*")
        .single();
      if (error) throw error;
      return { row: data as OFPeriodPerformance, calc };
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["of-period", vars.of_deal_id, vars.period_year] });
      qc.invalidateQueries({ queryKey: ["of-period", "by-deals"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
    },
  });
}
