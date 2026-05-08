import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { calcTelePeriod } from "@/lib/finance/calc";
import type {
  CommissionBasis,
  PaymentStatusV2,
  TeleDeal,
  TelePeriodPerformance,
} from "@/types/finance";

export interface TeleDealRow extends TeleDeal {
  creator?: { id: string; name: string } | null;
}

/**
 * List active Telegram deals plus their attached creator name.
 * Includes inactive when `includeInactive=true`.
 */
export function useTeleDeals(opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["tele-deals", "list", !!opts.includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("tele_deals")
        .select("*, creator:creators(id, name)")
        .order("created_at", { ascending: false });
      if (!opts.includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TeleDealRow[];
    },
  });
}

export interface TeleDealInput {
  creator_id: string;
  recast_commission_pct: number;
  commission_basis: CommissionBasis;
  min_guarantee: number | null;
  contract_start: string; // YYYY-MM-DD
  contract_end: string;
  active?: boolean;
  notes?: string | null;
}

export function useAddTeleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TeleDealInput) => {
      const { data, error } = await supabase
        .from("tele_deals")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as TeleDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tele-deals"] }),
  });
}

export function useUpdateTeleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<TeleDealInput> }) => {
      const { data, error } = await supabase
        .from("tele_deals")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as TeleDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tele-deals"] }),
  });
}

export function useDeleteTeleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tele_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tele-deals"] });
      qc.invalidateQueries({ queryKey: ["tele-period"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Performance grid (gross/net per month per creator)
// ─────────────────────────────────────────────────────────────────────

/** Fetches all Telegram performance rows for a creator in a year. */
export function useTelePeriods(creatorId: string | null, year: number) {
  return useQuery({
    queryKey: ["tele-period", creatorId, year],
    enabled: !!creatorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tele_period_performance")
        .select("*")
        .eq("creator_id", creatorId)
        .eq("period_year", year)
        .order("period_month");
      if (error) throw error;
      return (data ?? []) as TelePeriodPerformance[];
    },
  });
}

/** Bulk fetch for many creators in one year, indexed [creatorId][month] = row. */
export function useTelePeriodsByCreators(creatorIds: string[], year: number) {
  return useQuery({
    queryKey: ["tele-period", "by-creators", creatorIds.join(","), year],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tele_period_performance")
        .select("*")
        .in("creator_id", creatorIds)
        .eq("period_year", year);
      if (error) throw error;
      const map: Record<string, Record<number, TelePeriodPerformance>> = {};
      for (const row of (data ?? []) as TelePeriodPerformance[]) {
        map[row.creator_id] ??= {};
        map[row.creator_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export interface TelePeriodInput {
  creator_id: string;
  period_year: number;
  period_month: number;
  gross_revenue: number;
  net_revenue?: number;             // optional override (defaults to 50% of gross)
  status?: PaymentStatusV2;
  paid_at?: string | null;
  notes?: string | null;
  // To compute commission + top-up + qualified flag client-side, we need the deal:
  recast_commission_pct: number;
  commission_basis: CommissionBasis;
  min_guarantee: number | null;
}

/**
 * Upsert a single (creator, year, month) row. Calc engine runs client-side
 * to fill in the derived fields (qualified, top-up, commission) so the row
 * stored in Supabase already reflects the agreed math — no triggers needed.
 */
export function useUpsertTelePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TelePeriodInput) => {
      const calc = calcTelePeriod({
        gross_revenue: input.gross_revenue,
        net_revenue: input.net_revenue,
        recast_commission_pct: input.recast_commission_pct,
        commission_basis: input.commission_basis,
        min_guarantee: input.min_guarantee,
      });

      const row = {
        creator_id: input.creator_id,
        period_year: input.period_year,
        period_month: input.period_month,
        gross_revenue: calc.gross_revenue,
        net_revenue: calc.net_revenue,
        mg_top_up: calc.mg_top_up,
        recast_commission: calc.recast_commission,
        qualified_for_mg: calc.qualified_for_mg,
        status: input.status ?? "unpaid",
        paid_at: input.paid_at ?? null,
        notes: input.notes ?? null,
      };

      const { data, error } = await supabase
        .from("tele_period_performance")
        .upsert(row, { onConflict: "creator_id,period_year,period_month" })
        .select("*")
        .single();
      if (error) throw error;
      return { row: data as TelePeriodPerformance, calc };
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["tele-period", vars.creator_id, vars.period_year] });
      qc.invalidateQueries({ queryKey: ["tele-period", "by-creators"] });
    },
  });
}
