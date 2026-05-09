import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatUSD } from "@/lib/utils";

/**
 * The full overdue list — name, amount owed, days overdue, invoice link.
 * Clickable banner at the top of /finance: collapsed shows the count,
 * expanded shows every overdue item across every payment table grouped
 * by section (vendors / campaigns / Tele / OF / house rent / utilities).
 *
 * Phase J-3: this replaces the Phase I OverdueBadge (count-only).
 */

interface OverdueRow {
  source: "vendor" | "campaign" | "telegram" | "onlyfans" | "house_rent" | "house_utility";
  /** Display name — vendor name, creator name, utility name, etc. */
  name: string;
  amount: number;
  period_year: number;
  period_month: number;
  paid_at: string | null;
  invoice_url: string | null;
  /** Days past EOM. */
  days_overdue: number;
}

const SOURCE_LABEL: Record<OverdueRow["source"], string> = {
  vendor: "Vendor",
  campaign: "Campaign",
  telegram: "Telegram",
  onlyfans: "OnlyFans",
  house_rent: "Rent",
  house_utility: "Utility",
};

/** First day of the month AFTER (year, month) — i.e. the EOM-due deadline. */
function deadline(year: number, month: number): Date {
  return new Date(year, month, 1, 0, 0, 0, 0);
}
function daysOverdue(year: number, month: number, now: Date = new Date()): number {
  const dl = deadline(year, month);
  const diff = now.getTime() - dl.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function useOverdueRows() {
  return useQuery({
    queryKey: ["overdue-rows"],
    queryFn: async (): Promise<OverdueRow[]> => {
      const out: OverdueRow[] = [];

      // Vendor payments — joined to vendor name
      const vendors = await supabase
        .from("vendor_payments")
        .select("amount, period_year, period_month, paid_at, invoice_url, vendor:vendors(name)")
        .eq("status", "overdue");
      for (const r of (vendors.data ?? []) as any[]) {
        out.push({
          source: "vendor",
          name: r.vendor?.name ?? "Vendor",
          amount: Number(r.amount) || 0,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: r.invoice_url,
          days_overdue: daysOverdue(r.period_year, r.period_month),
        });
      }

      // Campaign payments — joined via campaign_creator → creator name
      const camps = await supabase
        .from("campaign_payments")
        .select(
          "amount, period_year, period_month, paid_at, invoice_url, campaign_creator:campaign_creators(creator:creators(name))",
        )
        .eq("status", "overdue");
      for (const r of (camps.data ?? []) as any[]) {
        out.push({
          source: "campaign",
          name: r.campaign_creator?.creator?.name ?? "Creator",
          amount: Number(r.amount) || 0,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: r.invoice_url,
          days_overdue: daysOverdue(r.period_year, r.period_month),
        });
      }

      // Tele performance — joined to creator
      const tele = await supabase
        .from("tele_period_performance")
        .select(
          "gross_revenue, recast_commission, period_year, period_month, paid_at, creator:creators(name)",
        )
        .eq("status", "overdue");
      for (const r of (tele.data ?? []) as any[]) {
        out.push({
          source: "telegram",
          name: r.creator?.name ?? "Creator",
          amount: Number(r.recast_commission) || 0,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: null,
          days_overdue: daysOverdue(r.period_year, r.period_month),
        });
      }

      // OF performance
      const of = await supabase
        .from("of_period_performance")
        .select(
          "gross_revenue, recast_commission, period_year, period_month, paid_at, deal:of_deals(creator:creators(name), page_name)",
        )
        .eq("status", "overdue");
      for (const r of (of.data ?? []) as any[]) {
        const cn_ = r.deal?.creator?.name ?? "Creator";
        const page = r.deal?.page_name;
        out.push({
          source: "onlyfans",
          name: page ? `${cn_} — ${page}` : cn_,
          amount: Number(r.recast_commission) || 0,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: null,
          days_overdue: daysOverdue(r.period_year, r.period_month),
        });
      }

      // House rent
      const rent = await supabase
        .from("house_rent_payments")
        .select("amount, period_year, period_month, paid_at, resident:house_residents(name)")
        .eq("status", "overdue");
      for (const r of (rent.data ?? []) as any[]) {
        out.push({
          source: "house_rent",
          name: r.resident?.name ?? "Resident",
          amount: Number(r.amount) || 0,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: null,
          days_overdue: daysOverdue(r.period_year, r.period_month),
        });
      }

      // House utilities
      const util = await supabase
        .from("house_utility_payments")
        .select("amount, period_year, period_month, paid_at, utility:house_utilities(utility_name)")
        .eq("status", "overdue");
      for (const r of (util.data ?? []) as any[]) {
        out.push({
          source: "house_utility",
          name: r.utility?.utility_name ?? "Utility",
          amount: Number(r.amount) || 0,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: null,
          days_overdue: daysOverdue(r.period_year, r.period_month),
        });
      }

      // Sort by most-overdue first
      out.sort((a, b) => b.days_overdue - a.days_overdue);
      return out;
    },
    refetchInterval: 60_000,
  });
}

/**
 * Drop-in banner at the top of /finance. Collapsed when nothing is
 * overdue (renders nothing). Otherwise shows the count + a click-to-expand
 * affordance with the full list inside.
 */
export function OverdueDrawer() {
  const { data, isLoading } = useOverdueRows();
  const [open, setOpen] = React.useState(false);

  if (isLoading) return null;
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const totalOwed = rows.reduce((s, r) => s + r.amount, 0);

  // Rows with amount === 0 are typically vendor cells where the bill amount
  // hasn't been entered yet. They still count as overdue (the period exists)
  // but get a "—" placeholder + a soft warning.
  const missingAmountCount = rows.filter((r) => !r.amount || r.amount <= 0).length;

  return (
    <div className="overflow-hidden rounded-md border border-rose-300 bg-card">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-start gap-3 bg-rose-50 p-3 text-left text-sm text-rose-900 hover:bg-rose-100/70"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {rows.length} overdue payment{rows.length === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums">{formatUSD(totalOwed, { decimals: 2 })}</span>{" "}
            outstanding
          </div>
          <div className="text-xs text-rose-800/80">
            Click to {open ? "hide" : "see"} the full list.
            {missingAmountCount > 0 && (
              <>
                {" · "}
                <span className="font-medium">
                  {missingAmountCount} row{missingAmountCount === 1 ? "" : "s"} missing an amount
                </span>
              </>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-rose-200 bg-card text-foreground">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Section</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Days late</th>
                <th className="px-3 py-2 text-right font-medium">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const missingAmount = !r.amount || r.amount <= 0;
                return (
                  <tr
                    key={i}
                    className={cn(
                      "border-b last:border-b-0 hover:bg-muted/30",
                      i % 2 === 0 ? "bg-card" : "bg-muted/15",
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {SOURCE_LABEL[r.source]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.period_year, r.period_month - 1).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-semibold tabular-nums",
                        missingAmount ? "text-amber-700" : "text-foreground",
                      )}
                      title={missingAmount ? "Bill amount not entered for this period" : undefined}
                    >
                      {missingAmount ? "—" : formatUSD(r.amount, { decimals: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-rose-700">
                      {r.days_overdue}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.invoice_url ? (
                        <a
                          href={r.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-rose-700 underline hover:text-rose-900"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
