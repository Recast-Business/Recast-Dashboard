import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface FinanceSummary {
  totalActiveEarnings: number;
  totalActiveCommission: number;
  overdueCount: number;
  overdueCampaigns: Array<{ id: string; name: string; brand: string | null }>;
  awaitingPaymentCount: number;
  cashFlowThisMonth: number;
  cashFlowNextMonth: number;
}

function monthBounds(offset = 0): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function useFinanceSummary() {
  return useQuery({
    queryKey: ["finance-summary"],
    queryFn: async (): Promise<FinanceSummary> => {
      const { data: activeAgg, error: aggErr } = await supabase
        .from("campaign_creators")
        .select(
          `cached_earnings, cached_commission, payment_status,
           campaign:campaigns!inner(id, name, status, payment_due_date,
             brand:brands!inner(name))`,
        );
      if (aggErr) throw aggErr;

      const rows = activeAgg ?? [];
      const live = rows.filter((r: any) =>
        ["active", "awaiting_payment", "overdue", "pending"].includes(r.campaign?.status),
      );

      const totalActiveEarnings = live.reduce(
        (s: number, r: any) => s + Number(r.cached_earnings ?? 0),
        0,
      );
      const totalActiveCommission = live.reduce(
        (s: number, r: any) => s + Number(r.cached_commission ?? 0),
        0,
      );

      const awaitingPaymentCount = rows.filter(
        (r: any) => r.payment_status === "awaiting",
      ).length;

      const { data: overdue, error: oErr } = await supabase
        .from("campaigns")
        .select("id, name, brand:brands!inner(name)")
        .eq("status", "overdue");
      if (oErr) throw oErr;

      const thisMonth = monthBounds(0);
      const nextMonth = monthBounds(1);
      const cashThisMonth = live
        .filter(
          (r: any) =>
            r.campaign?.payment_due_date &&
            r.campaign.payment_due_date >= thisMonth.start &&
            r.campaign.payment_due_date <= thisMonth.end,
        )
        .reduce((s: number, r: any) => s + Number(r.cached_earnings ?? 0), 0);

      const cashNextMonth = live
        .filter(
          (r: any) =>
            r.campaign?.payment_due_date &&
            r.campaign.payment_due_date >= nextMonth.start &&
            r.campaign.payment_due_date <= nextMonth.end,
        )
        .reduce((s: number, r: any) => s + Number(r.cached_earnings ?? 0), 0);

      return {
        totalActiveEarnings,
        totalActiveCommission,
        overdueCount: overdue?.length ?? 0,
        overdueCampaigns: (overdue ?? []).map((o: any) => ({
          id: o.id,
          name: o.name,
          brand: o.brand?.name ?? null,
        })),
        awaitingPaymentCount,
        cashFlowThisMonth: cashThisMonth,
        cashFlowNextMonth: cashNextMonth,
      };
    },
    refetchInterval: 30_000,
  });
}
