import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TalentInvoice } from "@/types/finance";

/**
 * Round 4 C — performance hook for the /talents/:id detail page.
 *
 * One hook fetches every payment-event source tied to a creator and
 * aggregates them client-side. Two query modes:
 *
 *   • year = number  → all data filtered to that calendar year
 *   • year = null    → lifetime (no year filter)
 *
 * Sources covered:
 *
 *   1. of_deals + of_period_performance     — OnlyFans
 *   2. tele_period_performance              — Telegram (deal-implicit)
 *   3. campaign_creators + campaign_payments — Ad Overlay / brand deals
 *   4. talent_invoices                      — Invoices Recast issues
 *
 * Aggregations:
 *   - gross / recast / take-home / count per platform
 *   - monthlyTrend  → { ym: 'YYYY-MM', gross }[] (for sparkline)
 *   - onTimeRate    → invoices paid before due_date / total finalised
 *
 * The hook deliberately does NOT touch tax_records — that lives on its
 * own hook (useTaxRecords) and the page composes the two views side by
 * side.
 */

export interface PlatformSummary {
  gross: number;
  recastCommission: number;
  creatorTakeHome: number;
  periodCount: number;
}

export interface MonthlyTrendPoint {
  ym: string; // e.g. "2026-05"
  gross: number;
}

export interface RecentInvoice extends TalentInvoice {
  // Already has all the fields we need from TalentInvoice.
}

export interface CreatorPerformance {
  // Per-platform rollups
  of: PlatformSummary;
  telegram: PlatformSummary;
  overlay: PlatformSummary;
  // Totals
  totalGross: number;
  totalRecast: number;
  totalTakeHome: number;
  // Last 12 months of gross (whatever year mode is — clipped to that
  // year if year is set, full lifetime range otherwise)
  monthlyTrend: MonthlyTrendPoint[];
  // Invoice timeliness
  invoiceCount: number;
  invoicePaidCount: number;
  invoiceOnTimeCount: number;
  invoiceOnTimeRate: number | null; // null when no paid invoices yet
  // Recent activity (newest first, max 10)
  recentInvoices: RecentInvoice[];
}

export function useCreatorPerformance(
  creatorId: string | undefined,
  year: number | null,
) {
  return useQuery({
    enabled: !!creatorId,
    queryKey: ["creator-performance", creatorId, year ?? "lifetime"],
    queryFn: async (): Promise<CreatorPerformance> => {
      const id = creatorId!;
      // ──────────────────────────────────────────────────────────
      // 1. OnlyFans — deals for this creator, then period rows.
      // ──────────────────────────────────────────────────────────
      const { data: ofDeals, error: ofErr } = await supabase
        .from("of_deals")
        .select("id")
        .eq("creator_id", id);
      if (ofErr) throw ofErr;
      const ofDealIds = (ofDeals ?? []).map((d: { id: string }) => d.id);

      let ofPeriods: Array<{
        period_year: number;
        period_month: number;
        gross_revenue: number;
        recast_commission: number;
        girls_share: number;
      }> = [];
      if (ofDealIds.length > 0) {
        let q = supabase
          .from("of_period_performance")
          .select("period_year, period_month, gross_revenue, recast_commission, girls_share")
          .in("of_deal_id", ofDealIds);
        if (year !== null) q = q.eq("period_year", year);
        const { data, error } = await q;
        if (error) throw error;
        ofPeriods = data ?? [];
      }

      // ──────────────────────────────────────────────────────────
      // 2. Telegram — period rows keyed directly on creator_id.
      // ──────────────────────────────────────────────────────────
      let telePeriods: Array<{
        period_year: number;
        period_month: number;
        gross_revenue: number;
        recast_commission: number;
        creator_take_home: number;
      }> = [];
      {
        let q = supabase
          .from("tele_period_performance")
          .select("period_year, period_month, gross_revenue, recast_commission, creator_take_home")
          .eq("creator_id", id);
        if (year !== null) q = q.eq("period_year", year);
        const { data, error } = await q;
        if (error) throw error;
        telePeriods = data ?? [];
      }

      // ──────────────────────────────────────────────────────────
      // 3. Ad Overlay — campaign_creators where this creator is
      //    attached, then their payments. Commission is derived from
      //    cc.commission_pct OR campaign.default_commission_pct.
      // ──────────────────────────────────────────────────────────
      const { data: ccs, error: ccErr } = await supabase
        .from("campaign_creators")
        .select("id, commission_pct, campaign:campaigns(default_commission_pct)")
        .eq("creator_id", id);
      if (ccErr) throw ccErr;
      const ccIds = (ccs ?? []).map((c: { id: string }) => c.id);

      // Build commission lookup so we can compute Recast cut per
      // payment. Supabase's nested-select returns the joined campaign
      // as an array (even though FK is many-to-one), so we normalise
      // by grabbing the first element.
      const commissionByCC = new Map<string, number>();
      for (const c of (ccs ?? []) as Array<{
        id: string;
        commission_pct: number | null;
        campaign:
          | { default_commission_pct: number }
          | Array<{ default_commission_pct: number }>
          | null;
      }>) {
        const campaign = Array.isArray(c.campaign) ? c.campaign[0] : c.campaign;
        const pct =
          c.commission_pct != null
            ? c.commission_pct
            : campaign?.default_commission_pct ?? 0;
        commissionByCC.set(c.id, pct);
      }

      let overlayPayments: Array<{
        campaign_creator_id: string;
        period_year: number;
        period_month: number;
        amount: number;
        status: string;
      }> = [];
      if (ccIds.length > 0) {
        let q = supabase
          .from("campaign_payments")
          .select("campaign_creator_id, period_year, period_month, amount, status")
          .in("campaign_creator_id", ccIds);
        if (year !== null) q = q.eq("period_year", year);
        const { data, error } = await q;
        if (error) throw error;
        overlayPayments = data ?? [];
      }

      // ──────────────────────────────────────────────────────────
      // 4. Talent invoices — full row needed for recent activity.
      // ──────────────────────────────────────────────────────────
      let invoices: TalentInvoice[] = [];
      {
        let q = supabase
          .from("talent_invoices")
          .select("*")
          .eq("creator_id", id)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false });
        if (year !== null) q = q.eq("period_year", year);
        const { data, error } = await q;
        if (error) throw error;
        invoices = (data ?? []) as TalentInvoice[];
      }

      // ──────────────────────────────────────────────────────────
      // Aggregate per platform.
      // ──────────────────────────────────────────────────────────
      const of: PlatformSummary = {
        gross: 0,
        recastCommission: 0,
        creatorTakeHome: 0,
        periodCount: ofPeriods.length,
      };
      for (const p of ofPeriods) {
        of.gross += Number(p.gross_revenue) || 0;
        of.recastCommission += Number(p.recast_commission) || 0;
        of.creatorTakeHome += Number(p.girls_share) || 0;
      }

      const telegram: PlatformSummary = {
        gross: 0,
        recastCommission: 0,
        creatorTakeHome: 0,
        periodCount: telePeriods.length,
      };
      for (const p of telePeriods) {
        telegram.gross += Number(p.gross_revenue) || 0;
        telegram.recastCommission += Number(p.recast_commission) || 0;
        telegram.creatorTakeHome += Number(p.creator_take_home) || 0;
      }

      const overlay: PlatformSummary = {
        gross: 0,
        recastCommission: 0,
        creatorTakeHome: 0,
        periodCount: overlayPayments.length,
      };
      for (const p of overlayPayments) {
        const amt = Number(p.amount) || 0;
        const pct = commissionByCC.get(p.campaign_creator_id) ?? 0;
        const recast = amt * (pct / 100);
        overlay.gross += amt;
        overlay.recastCommission += recast;
        overlay.creatorTakeHome += amt - recast;
      }

      const totalGross = of.gross + telegram.gross + overlay.gross;
      const totalRecast =
        of.recastCommission + telegram.recastCommission + overlay.recastCommission;
      const totalTakeHome =
        of.creatorTakeHome + telegram.creatorTakeHome + overlay.creatorTakeHome;

      // ──────────────────────────────────────────────────────────
      // Monthly trend — sum gross by YYYY-MM across all platforms.
      // ──────────────────────────────────────────────────────────
      const monthMap = new Map<string, number>();
      function bucket(y: number, m: number, gross: number) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + gross);
      }
      for (const p of ofPeriods) bucket(p.period_year, p.period_month, Number(p.gross_revenue) || 0);
      for (const p of telePeriods) bucket(p.period_year, p.period_month, Number(p.gross_revenue) || 0);
      for (const p of overlayPayments) bucket(p.period_year, p.period_month, Number(p.amount) || 0);
      const monthlyTrend: MonthlyTrendPoint[] = [...monthMap.entries()]
        .map(([ym, gross]) => ({ ym, gross }))
        .sort((a, b) => a.ym.localeCompare(b.ym));

      // ──────────────────────────────────────────────────────────
      // Invoice timeliness — "on-time" = paid_at <= due_date.
      // ──────────────────────────────────────────────────────────
      let invoicePaidCount = 0;
      let invoiceOnTimeCount = 0;
      for (const inv of invoices) {
        if (inv.status === "paid" && inv.paid_at) {
          invoicePaidCount++;
          if (inv.paid_at <= inv.due_date) invoiceOnTimeCount++;
        }
      }
      const invoiceOnTimeRate =
        invoicePaidCount > 0 ? invoiceOnTimeCount / invoicePaidCount : null;

      return {
        of,
        telegram,
        overlay,
        totalGross,
        totalRecast,
        totalTakeHome,
        monthlyTrend,
        invoiceCount: invoices.length,
        invoicePaidCount,
        invoiceOnTimeCount,
        invoiceOnTimeRate,
        recentInvoices: invoices.slice(0, 10),
      };
    },
  });
}
