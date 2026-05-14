import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * R5 follow-up — batched YTD gross earnings per signed creator.
 *
 * useCreatorPerformance is per-creator (one round-trip × 4 tables per
 * row), so calling it for every Roster row would be N+1 across the
 * signed pool. This hook batches the same source data in 5 queries
 * total and returns a flat Map<creator_id, ytdGross>.
 *
 * Sources covered (same as useCreatorPerformance, summed at gross):
 *   • OnlyFans  — of_period_performance.gross_revenue, scoped by year,
 *                 joined back to of_deals.creator_id.
 *   • Telegram  — tele_period_performance.gross_revenue, scoped by
 *                 year, creator_id is on the row directly.
 *   • Overlay   — campaign_payments.amount, scoped by year, joined
 *                 back through campaign_creators.creator_id.
 *
 * Aggregation is "gross billed" — what the Roster table shows is the
 * top-line number, not net to creator. Drill into /talents/:id for
 * the full breakdown (commission, take-home, etc.).
 *
 * The map is keyed by creator_id so consumers can read O(1) per row.
 * Empty for creators with no logged data this year (don't render the
 * column, render —, etc. — caller's choice).
 */
export function useRosterEarningsYTD(year: number) {
  return useQuery({
    queryKey: ["roster-earnings-ytd", year],
    queryFn: async (): Promise<Map<string, number>> => {
      const totals = new Map<string, number>();
      const add = (creatorId: string | null | undefined, amount: number) => {
        if (!creatorId) return;
        totals.set(creatorId, (totals.get(creatorId) ?? 0) + amount);
      };

      // ──────────────────────────────────────────────────────────
      // 1. Telegram — period rows carry creator_id directly.
      // ──────────────────────────────────────────────────────────
      const teleRes = await supabase
        .from("tele_period_performance")
        .select("creator_id, gross_revenue")
        .eq("period_year", year);
      if (teleRes.error) throw teleRes.error;
      for (const r of (teleRes.data ?? []) as Array<{
        creator_id: string;
        gross_revenue: number | null;
      }>) {
        add(r.creator_id, Number(r.gross_revenue) || 0);
      }

      // ──────────────────────────────────────────────────────────
      // 2. OnlyFans — period rows reference of_deal_id; the deal
      //    carries the creator_id. We join in PostgREST.
      // ──────────────────────────────────────────────────────────
      const ofRes = await supabase
        .from("of_period_performance")
        .select("gross_revenue, of_deal:of_deals(creator_id)")
        .eq("period_year", year);
      if (ofRes.error) throw ofRes.error;
      for (const r of (ofRes.data ?? []) as Array<{
        gross_revenue: number | null;
        of_deal:
          | { creator_id: string }
          | Array<{ creator_id: string }>
          | null;
      }>) {
        const deal = Array.isArray(r.of_deal) ? r.of_deal[0] : r.of_deal;
        add(deal?.creator_id, Number(r.gross_revenue) || 0);
      }

      // ──────────────────────────────────────────────────────────
      // 3. Overlay — campaign_payments references campaign_creator,
      //    which carries the creator_id.
      // ──────────────────────────────────────────────────────────
      const overlayRes = await supabase
        .from("campaign_payments")
        .select("amount, campaign_creator:campaign_creators(creator_id)")
        .eq("period_year", year);
      if (overlayRes.error) throw overlayRes.error;
      for (const r of (overlayRes.data ?? []) as Array<{
        amount: number | null;
        campaign_creator:
          | { creator_id: string }
          | Array<{ creator_id: string }>
          | null;
      }>) {
        const cc = Array.isArray(r.campaign_creator)
          ? r.campaign_creator[0]
          : r.campaign_creator;
        add(cc?.creator_id, Number(r.amount) || 0);
      }

      return totals;
    },
  });
}
