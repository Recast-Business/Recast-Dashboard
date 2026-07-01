import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PaymentSource } from "@/types/finance";

/**
 * Phase K-5 (partial): single aggregation hook backing the Overview page.
 *
 * Pulls 4 things in parallel:
 *  1. payment_receipts for the year — bucketed by source + month → drives
 *     the inflow / outflow KPIs and the 12-month trend chart.
 *  2. All overdue period rows across the 6 payment tables — drives the
 *     "outstanding overdue" KPI and the top-5 most-late list.
 *  3. Top 5 talents by gross this month (Tele + OF combined).
 *  4. Top 5 vendors by paid spend this month.
 *
 * Direction convention:
 *   inflow  = source in (telegram, onlyfans, campaign, house_rent)
 *   outflow = source in (vendor, house_utility)
 * Both are amounts on payment_receipts; we just bucket by source.
 */

export interface MonthlyFlow {
  month: number;          // 1-12
  inflow: number;
  outflow: number;
  net: number;
}

export interface OverdueLeader {
  source: PaymentSource;
  name: string;
  amount: number;          // remaining owed (owed - amount_paid)
  period_year: number;
  period_month: number;
  days_overdue: number;
  /** Round-1 efficiency: deep link to the obligor's page so the
   *  banner row is actionable, not just informational. Null when
   *  the joined id was missing. */
  link: string | null;
}

export interface TalentLeader {
  source: "telegram" | "onlyfans";
  name: string;            // creator name (+ page for OF)
  gross: number;
  commission: number;
}

export interface VendorLeader {
  vendor_id: string;
  name: string;
  paid: number;            // amount_paid this month
}

export interface FinanceOverview {
  /** KPI: receipts logged this month, by direction. */
  inflow_this_month: number;
  outflow_this_month: number;
  net_this_month: number;
  /** KPI: total amount still owed across every overdue row. */
  outstanding_overdue: number;
  /** 12-month trend (Jan..Dec for the requested year). */
  monthly: MonthlyFlow[];
  /** Same shape, but for the previous year — drives the YoY overlay. */
  monthly_prev_year: MonthlyFlow[];
  /** Top-5 most late, in days. */
  most_overdue: OverdueLeader[];
  /** Top-5 talents by gross this month. */
  top_talents: TalentLeader[];
  /** Top-5 vendors by paid spend this month. */
  top_vendors: VendorLeader[];
}

const INFLOW_SOURCES: PaymentSource[] = ["telegram", "onlyfans", "campaign", "house_rent"];

function startOfMonthISO(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString().slice(0, 10);
}
function endOfMonthISO(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}
function startOfYearISO(year: number): string {
  return `${year}-01-01`;
}
function endOfYearISO(year: number): string {
  return `${year}-12-31`;
}
function daysOverdue(year: number, month: number, now: Date = new Date()): number {
  const deadline = new Date(year, month, 1);
  const diff = now.getTime() - deadline.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export function useFinanceOverview(year: number) {
  return useQuery({
    queryKey: ["finance-overview", year],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<FinanceOverview> => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const monthStart = startOfMonthISO(currentYear, currentMonth);
      const monthEnd = endOfMonthISO(currentYear, currentMonth);

      // ── 1. Receipts for the year (and prior year, for YoY overlay) ─────
      const [receiptsRes, receiptsPrevRes] = await Promise.all([
        supabase
          .from("payment_receipts")
          .select("source, amount, received_at")
          .gte("received_at", startOfYearISO(year))
          .lte("received_at", endOfYearISO(year)),
        supabase
          .from("payment_receipts")
          .select("source, amount, received_at")
          .gte("received_at", startOfYearISO(year - 1))
          .lte("received_at", endOfYearISO(year - 1)),
      ]);
      if (receiptsRes.error) throw receiptsRes.error;
      if (receiptsPrevRes.error) throw receiptsPrevRes.error;

      function emptyMonthly(): MonthlyFlow[] {
        return Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          inflow: 0,
          outflow: 0,
          net: 0,
        }));
      }
      const monthly = emptyMonthly();
      const monthlyPrev = emptyMonthly();
      let inflowThisMonth = 0;
      let outflowThisMonth = 0;
      for (const r of (receiptsRes.data ?? []) as any[]) {
        const dt = new Date(r.received_at);
        const m = dt.getMonth() + 1;
        const amt = Number(r.amount) || 0;
        const isInflow = INFLOW_SOURCES.includes(r.source as PaymentSource);
        if (year === dt.getFullYear()) {
          if (isInflow) monthly[m - 1].inflow += amt;
          else monthly[m - 1].outflow += amt;
        }
        // Current-month KPI is always relative to TODAY, regardless of `year` filter.
        if (
          dt.getFullYear() === currentYear &&
          dt.getMonth() + 1 === currentMonth
        ) {
          if (isInflow) inflowThisMonth += amt;
          else outflowThisMonth += amt;
        }
      }
      for (const r of (receiptsPrevRes.data ?? []) as any[]) {
        const dt = new Date(r.received_at);
        const m = dt.getMonth() + 1;
        const amt = Number(r.amount) || 0;
        const isInflow = INFLOW_SOURCES.includes(r.source as PaymentSource);
        if (year - 1 === dt.getFullYear()) {
          if (isInflow) monthlyPrev[m - 1].inflow += amt;
          else monthlyPrev[m - 1].outflow += amt;
        }
      }
      for (const m of monthly) m.net = m.inflow - m.outflow;
      for (const m of monthlyPrev) m.net = m.inflow - m.outflow;

      // ── 2. Overdue rows across the six payment tables ──────────────────
      // R5 Sweep 1: rent + utility queries kept (for potential future
      // re-introduction or other metrics) but their results are
      // intentionally NOT pushed into the dashboard overdue list per
      // Gustavo's "Frazier's house stays separate" rule.
      const [
        vendorsOverdue,
        teleOverdue,
        ofOverdue,
        _rentOverdueUnused,
        _utilityOverdueUnused,
        campaignOverdue,
      ] = await Promise.all([
        supabase
          .from("vendor_payments")
          .select("amount, amount_paid, period_year, period_month, vendor:vendors(id, name)")
          .eq("status", "overdue"),
        supabase
          .from("tele_period_performance")
          .select("recast_commission, amount_paid, period_year, period_month, creator:creators(id, name)")
          .eq("status", "overdue"),
        supabase
          .from("of_period_performance")
          .select("recast_commission, amount_paid, period_year, period_month, deal:of_deals(creator:creators(id, name), page_name)")
          .eq("status", "overdue"),
        supabase
          .from("house_rent_payments")
          .select("amount, amount_paid, period_year, period_month, resident:house_residents(name)")
          .eq("status", "overdue"),
        supabase
          .from("house_utility_payments")
          .select("amount, amount_paid, period_year, period_month, utility:house_utilities(utility_name)")
          .eq("status", "overdue"),
        supabase
          .from("campaign_payments")
          .select("amount, amount_paid, period_year, period_month, campaign_creator:campaign_creators(campaign_id, creator:creators(name))")
          .eq("status", "overdue"),
      ]);

      const overdue: OverdueLeader[] = [];
      const pushOverdue = (
        source: PaymentSource,
        name: string,
        owed: number,
        paid: number,
        py: number,
        pm: number,
        link: string | null,
      ) => {
        const remaining = Math.max(0, owed - paid);
        if (remaining <= 0) return;
        overdue.push({
          source,
          name,
          amount: remaining,
          period_year: py,
          period_month: pm,
          days_overdue: daysOverdue(py, pm, now),
          link,
        });
      };
      // Links target the obligor's page. Overview is admin+accounting
      // only, so /talents/:id (same gating) is safe to link to.
      for (const r of (vendorsOverdue.data ?? []) as any[]) {
        pushOverdue("vendor", r.vendor?.name ?? "Vendor", Number(r.amount) || 0, Number(r.amount_paid) || 0, r.period_year, r.period_month,
          r.vendor?.id ? `/vendors/${r.vendor.id}` : null);
      }
      for (const r of (teleOverdue.data ?? []) as any[]) {
        pushOverdue("telegram", r.creator?.name ?? "Creator", Number(r.recast_commission) || 0, Number(r.amount_paid) || 0, r.period_year, r.period_month,
          r.creator?.id ? `/talents/${r.creator.id}` : null);
      }
      for (const r of (ofOverdue.data ?? []) as any[]) {
        const cn = r.deal?.creator?.name ?? "Creator";
        const page = r.deal?.page_name;
        pushOverdue("onlyfans", page ? `${cn} — ${page}` : cn, Number(r.recast_commission) || 0, Number(r.amount_paid) || 0, r.period_year, r.period_month,
          r.deal?.creator?.id ? `/talents/${r.deal.creator.id}` : null);
      }
      // R5 Sweep 1 (Gustavo, T1 + T3 emphasised): Frazier's House
      // rent + utility overdues are NOT surfaced in the dashboard's
      // overdue banner. "don't attach phrases house to that. Leave
      // Fraser's house as the separate thing". The dedicated /house
      // page keeps its own internal overdue treatment.
      //
      // Skipping the rent + utility loops here (data is still
      // fetched above for accurate outstanding totals elsewhere if
      // needed, but excluded from `overdue`/`most_overdue`).
      //
      // Intentionally left blank.
      for (const r of (campaignOverdue.data ?? []) as any[]) {
        pushOverdue("campaign", r.campaign_creator?.creator?.name ?? "Creator", Number(r.amount) || 0, Number(r.amount_paid) || 0, r.period_year, r.period_month,
          r.campaign_creator?.campaign_id ? `/campaigns?open=${r.campaign_creator.campaign_id}` : null);
      }
      const outstandingOverdue = overdue.reduce((s, r) => s + r.amount, 0);
      const mostOverdue = [...overdue]
        .sort((a, b) => b.days_overdue - a.days_overdue || b.amount - a.amount)
        .slice(0, 5);

      // ── 3. Top talents by gross THIS month ─────────────────────────────
      const [teleThisMonth, ofThisMonth] = await Promise.all([
        supabase
          .from("tele_period_performance")
          .select("gross_revenue, recast_commission, creator:creators(name)")
          .eq("period_year", currentYear)
          .eq("period_month", currentMonth),
        supabase
          .from("of_period_performance")
          .select("gross_revenue, recast_commission, deal:of_deals(creator:creators(name), page_name)")
          .eq("period_year", currentYear)
          .eq("period_month", currentMonth),
      ]);
      const talents: TalentLeader[] = [];
      for (const r of (teleThisMonth.data ?? []) as any[]) {
        if (Number(r.gross_revenue) <= 0) continue;
        talents.push({
          source: "telegram",
          name: r.creator?.name ?? "Creator",
          gross: Number(r.gross_revenue) || 0,
          commission: Number(r.recast_commission) || 0,
        });
      }
      for (const r of (ofThisMonth.data ?? []) as any[]) {
        if (Number(r.gross_revenue) <= 0) continue;
        const cn = r.deal?.creator?.name ?? "Creator";
        const page = r.deal?.page_name;
        talents.push({
          source: "onlyfans",
          name: page ? `${cn} — ${page}` : cn,
          gross: Number(r.gross_revenue) || 0,
          commission: Number(r.recast_commission) || 0,
        });
      }
      const topTalents = talents.sort((a, b) => b.gross - a.gross).slice(0, 5);

      // ── 4. Top vendors by paid spend THIS month ────────────────────────
      const vendorsThisMonth = await supabase
        .from("vendor_payments")
        .select("vendor_id, amount_paid, vendor:vendors(name)")
        .eq("period_year", currentYear)
        .eq("period_month", currentMonth);
      const byVendor = new Map<string, VendorLeader>();
      for (const r of (vendorsThisMonth.data ?? []) as any[]) {
        const paid = Number(r.amount_paid) || 0;
        if (paid <= 0) continue;
        const existing = byVendor.get(r.vendor_id);
        if (existing) existing.paid += paid;
        else byVendor.set(r.vendor_id, { vendor_id: r.vendor_id, name: r.vendor?.name ?? "Vendor", paid });
      }
      const topVendors = Array.from(byVendor.values()).sort((a, b) => b.paid - a.paid).slice(0, 5);

      // Mark variables as used (defensive against future linter changes)
      void monthStart;
      void monthEnd;

      return {
        inflow_this_month: inflowThisMonth,
        outflow_this_month: outflowThisMonth,
        net_this_month: inflowThisMonth - outflowThisMonth,
        outstanding_overdue: outstandingOverdue,
        monthly,
        monthly_prev_year: monthlyPrev,
        most_overdue: mostOverdue,
        top_talents: topTalents,
        top_vendors: topVendors,
      };
    },
  });
}
