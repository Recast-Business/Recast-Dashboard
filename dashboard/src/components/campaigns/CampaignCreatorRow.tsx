import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useDeleteCampaignCreator,
  type CampaignCreatorRow as CCRow,
} from "@/hooks/useCampaignCreators";
import { useConfirm } from "@/hooks/useConfirm";
import { useViewCampaignFinancials } from "@/auth/useRole";
import { CampaignPeriodCellDialog } from "@/components/campaigns/CampaignPeriodCellDialog";
import { effectiveInvoiceStatus } from "@/lib/finance/invoiceStatus";
import type { CampaignPayment, CampaignV2, PaymentStatusV2 } from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/30 text-muted-foreground",
  partial:
    "bg-gradient-to-r from-emerald-100 from-50% to-rose-100 to-50% text-foreground border-amber-200",
  paid: "bg-emerald-50 text-emerald-900 border-emerald-200",
  overdue: "bg-rose-50 text-rose-900 border-rose-200",
};

interface Props {
  campaignCreator: CCRow;
  /** Parent campaign — needed for the Ad Overlay branch (campaign_type,
   *  cpm_rate, ad_frequency_per_hr live on the campaign, not the
   *  campaign-creator). */
  campaign: CampaignV2;
  defaultCommissionPct: number;
  year: number;
  payments: Record<number, CampaignPayment>;
  onEdit: () => void;
}

export function CampaignCreatorRow({
  campaignCreator: cc, campaign, defaultCommissionPct, year, payments, onEdit,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const [editingMonth, setEditingMonth] = React.useState<number | null>(null);
  const del = useDeleteCampaignCreator();
  const confirm = useConfirm();
  const seeFinancials = useViewCampaignFinancials();

  const totals = React.useMemo(() => {
    let gross = 0, paidCount = 0;
    for (const p of Object.values(payments)) {
      gross += Number(p.amount) || 0;
      // Effective status derives from amount_paid vs amount + period
      // EOM deadline. Source of truth is the receipts allocation, not
      // any stored status hint. Matches the talent-invoice pattern.
      const eff = effectiveInvoiceStatus({
        amount: Number(p.amount) || 0,
        amount_paid: Number(p.amount_paid) || 0,
        period_year: p.period_year,
        period_month: p.period_month,
      });
      if (eff === "paid") paidCount++;
    }
    return { gross, paidCount };
  }, [payments]);

  const effectivePct = cc.commission_pct != null ? cc.commission_pct : defaultCommissionPct;
  const isAdOverlay = campaign.campaign_type === "Ad Overlay";
  // Operators with view_campaign_financials=false see only the deal *type*,
  // not the rates / flat amount / commission %. Ad Overlay deals pull
  // CPM + ad frequency from the parent campaign (not the creator row —
  // those columns are null for AO since the rate card is campaign-level).
  const dealLabel = isAdOverlay
    ? seeFinancials
      ? `Ad Overlay · $${campaign.cpm_rate ?? 0}/1k · ${campaign.ad_frequency_per_hr ?? 0} ads/hr`
      : "Ad Overlay"
    : seeFinancials
    ? cc.deal_type === "cpm"
      ? `CPM · $${cc.cpm_rate ?? 0}/1k`
      : cc.deal_type === "flat_fee"
      ? `Flat · ${formatUSD(cc.flat_amount ?? 0, { decimals: 0 })}`
      : `Hybrid · $${cc.cpm_rate ?? 0}/1k + ${formatUSD(cc.flat_amount ?? 0, { decimals: 0 })}`
    : cc.deal_type === "cpm"
    ? "CPM"
    : cc.deal_type === "flat_fee"
    ? "Flat fee"
    : "Hybrid";

  async function onDelete() {
    const ok = await confirm({
      title: `Remove ${cc.creator?.name ?? "creator"} from campaign?`,
      description: "This wipes their monthly performance for this campaign. Cannot be undone.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(cc.id);
      toast.success("Removed from campaign");
    } catch (e) {
      toast.error(`Remove failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-3 p-2.5 text-left text-sm hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{cc.creator?.name ?? "Unknown creator"}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              {dealLabel}
            </span>
            {seeFinancials && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                  cc.commission_pct != null
                    ? "bg-amber-100 text-amber-900"
                    : "bg-muted text-muted-foreground",
                )}
                title={cc.commission_pct != null ? "Per-creator override" : "Inherited from campaign default"}
              >
                {effectivePct}% to Recast{cc.commission_pct != null ? " (override)" : ""}
              </span>
            )}
          </div>
          {(cc.start_date || cc.end_date) && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {cc.start_date ?? "—"} → {cc.end_date ?? "—"}
            </div>
          )}
        </div>
        <div className="hidden items-center gap-2 text-xs sm:flex">
          {seeFinancials && (
            <>
              <span className="text-muted-foreground">Gross YTD</span>
              <span className="font-semibold tabular-nums">
                {formatUSD(totals.gross, { decimals: 0 })}
              </span>
              <span className="text-muted-foreground">·</span>
            </>
          )}
          <span className="text-muted-foreground">{totals.paidCount}/12 paid</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Monthly performance — {year}
          </div>
          <div className="grid grid-cols-12 gap-1">
            {MONTHS.map((label, i) => {
              const month = i + 1;
              const p = payments[month];
              // Status auto-derives — flipping the stored status field
              // is gone; the pill reflects allocated receipts vs owed.
              const status: PaymentStatusV2 = p
                ? effectiveInvoiceStatus({
                    amount: Number(p.amount) || 0,
                    amount_paid: Number(p.amount_paid) || 0,
                    period_year: p.period_year,
                    period_month: p.period_month,
                  })
                : "unpaid";
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => setEditingMonth(month)}
                  title={
                    seeFinancials && p?.amount != null
                      ? `${formatUSD(p.amount, { decimals: 2 })} · ${status} · click to edit`
                      : `${status} · click to edit`
                  }
                  className={cn(
                    "flex flex-col items-stretch gap-1 rounded-md border px-2 py-2 text-left transition hover:border-primary/50",
                    STATUS_STYLES[status],
                  )}
                >
                  <div className="text-[11px] font-medium uppercase tracking-wider">{label}</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {seeFinancials
                      ? p?.amount != null && Number(p.amount) > 0
                        ? formatUSDCompact(Number(p.amount))
                        : "—"
                      : status === "paid"
                      ? "✓"
                      : "—"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit page
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={del.isPending}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Remove
            </Button>
          </div>

          {editingMonth != null && (
            <CampaignPeriodCellDialog
              open
              onOpenChange={(o) => !o && setEditingMonth(null)}
              campaign={campaign}
              campaignCreator={cc}
              defaultCommissionPct={defaultCommissionPct}
              year={year}
              month={editingMonth}
              existing={payments[editingMonth] ?? null}
            />
          )}
        </div>
      )}
    </div>
  );
}
