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
  source:
    | "vendor"
    | "campaign"
    | "telegram"
    | "onlyfans"
    | "house_rent"
    | "house_utility"
    | "vendor_invoice"
    | "talent_invoice";
  /** Display name — vendor name, creator name, utility name, invoice description, etc. */
  name: string;
  amount: number;
  /** For period-based rows: the period year. For invoice rows: the due-date year. */
  period_year: number;
  /** For period-based rows: the period month (1-12). For invoice rows: the due-date month. */
  period_month: number;
  paid_at: string | null;
  invoice_url: string | null;
  /** Days past the deadline (EOM for periods, due_date for invoices). */
  days_overdue: number;
}

const SOURCE_LABEL: Record<OverdueRow["source"], string> = {
  vendor: "Vendor",
  campaign: "Campaign",
  telegram: "Telegram",
  onlyfans: "OnlyFans",
  house_rent: "Rent",
  house_utility: "Utility",
  vendor_invoice: "Vendor invoice",
  talent_invoice: "Talent invoice",
};

/** Days between an arbitrary deadline date and `now`. */
function daysOverdueFromDate(deadlineISO: string, now: Date = new Date()): number {
  const dl = new Date(deadlineISO);
  const diff = now.getTime() - dl.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

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

      // R5 follow-up (Gustavo): Frazier's House rent + utilities used
      // to feed the overdue banner via house_rent_payments and
      // house_utility_payments queries here. Removed — the banner is
      // a Recast-business-overdue signal; household residents owing
      // rent + utility bills owed by the house aren't related to
      // Recast invoicing and just inflated the count. Both sources
      // still drive the /house page directly; the only change is they
      // no longer surface here. Keeping the union members on
      // OverdueRow.source for backwards-compat with any cached rows.

      // Vendor invoices — ad-hoc bills past their custom due_date
      const invoices = await supabase
        .from("vendor_invoices")
        .select("amount, due_date, paid_at, invoice_url, description, vendor:vendors(name)")
        .eq("status", "overdue");
      for (const r of (invoices.data ?? []) as any[]) {
        const due = new Date(r.due_date);
        const vendorName = r.vendor?.name ?? "Vendor";
        out.push({
          source: "vendor_invoice",
          name: `${vendorName} — ${r.description}`,
          amount: Number(r.amount) || 0,
          period_year: due.getFullYear(),
          period_month: due.getMonth() + 1,
          paid_at: r.paid_at,
          invoice_url: r.invoice_url,
          days_overdue: daysOverdueFromDate(r.due_date),
        });
      }

      // Talent invoices (M-6) — creator invoices past their due_date
      const talentInv = await supabase
        .from("talent_invoices")
        .select("amount, amount_paid, due_date, paid_at, invoice_url, invoice_number, period_year, period_month, creator:creators(name)")
        .eq("status", "overdue");
      for (const r of (talentInv.data ?? []) as any[]) {
        const remaining = Math.max(0, (Number(r.amount) || 0) - (Number(r.amount_paid) || 0));
        if (remaining <= 0) continue;
        const creatorName = r.creator?.name ?? "Creator";
        const inv = r.invoice_number ? ` · ${r.invoice_number}` : "";
        out.push({
          source: "talent_invoice",
          name: `${creatorName}${inv}`,
          amount: remaining,
          period_year: r.period_year,
          period_month: r.period_month,
          paid_at: r.paid_at,
          invoice_url: r.invoice_url,
          days_overdue: daysOverdueFromDate(r.due_date),
        });
      }

      // Sort by most-overdue first
      out.sort((a, b) => b.days_overdue - a.days_overdue);
      return out;
    },
    // Same-tab mutations invalidate ["overdue-rows"] explicitly via the
    // payment hooks. The poll + window-focus refetch are fallbacks for
    // background changes (e.g. mark_overdue_payments cron, another tab).
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
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
