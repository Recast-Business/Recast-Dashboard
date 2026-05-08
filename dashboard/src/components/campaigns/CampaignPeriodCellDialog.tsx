import * as React from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useUpsertCampaignPayment } from "@/hooks/useCampaignPayments";
import { calcCampaignDeal, type DealType } from "@/lib/finance/campaign-calc";
import { formatUSD } from "@/lib/utils";
import type { CampaignCreatorV2, CampaignPayment, PaymentStatusV2 } from "@/types/finance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignCreator: CampaignCreatorV2;
  defaultCommissionPct: number;
  year: number;
  month: number;
  existing: CampaignPayment | null;
}

/**
 * Edit a single (campaign_creator, year, month) row. Lets the user enter
 * the month's views/displays/clicks and shows a live preview of what
 * the deal pays out. The amount stored in the payment row = the gross
 * computed by calcCampaignDeal.
 */
export function CampaignPeriodCellDialog({
  open, onOpenChange, campaignCreator: cc, defaultCommissionPct,
  year, month, existing,
}: Props) {
  const upsert = useUpsertCampaignPayment();

  // Local working copies of the metrics for THIS month. We don't update
  // the rolling totals on campaign_creators from here — those reflect
  // the deal lifetime; this row is a per-month checkpoint.
  const [views, setViews] = React.useState("");
  const [displays, setDisplays] = React.useState("");
  const [clicks, setClicks] = React.useState("");
  const [status, setStatus] = React.useState<PaymentStatusV2>("unpaid");
  const [paidAt, setPaidAt] = React.useState("");
  const [invoiceUrl, setInvoiceUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setViews(existing?.amount != null ? "" : ""); // metrics are derived from the deal — leave editable
    setDisplays("");
    setClicks("");
    setStatus(existing?.status ?? "unpaid");
    setPaidAt(existing?.paid_at ?? "");
    setInvoiceUrl(existing?.invoice_url ?? "");
    setNotes(existing?.notes ?? "");
  }, [open, existing]);

  const viewsNum = Number(views) || 0;
  const clicksNum = Number(clicks) || 0;
  const displaysNum = Number(displays) || 0;

  const preview = React.useMemo(
    () =>
      calcCampaignDeal({
        deal_type: cc.deal_type as DealType,
        cpm_rate: cc.cpm_rate,
        flat_amount: cc.flat_amount,
        views: viewsNum,
        displays: displaysNum,
        clicks: clicksNum,
        override_commission_pct: cc.commission_pct,
        default_commission_pct: defaultCommissionPct,
      }),
    [cc, viewsNum, displaysNum, clicksNum, defaultCommissionPct],
  );

  async function onSave() {
    try {
      await upsert.mutateAsync({
        campaign_creator_id: cc.id,
        period_year: year,
        period_month: month,
        amount: preview.gross,
        status,
        paid_at: paidAt || null,
        invoice_url: invoiceUrl.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`${MONTH_NAMES[month - 1]} ${year} updated`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{MONTH_NAMES[month - 1]} {year} — campaign month</DialogTitle>
          <DialogDescription>
            Enter the month's metrics. Gross, CTR, Recast commission, and
            creator take-home are computed live from the deal terms.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {(cc.deal_type === "cpm" || cc.deal_type === "hybrid") && (
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cp-views">Views</Label>
                <Input
                  id="cp-views"
                  type="number"
                  min="0"
                  value={views}
                  onChange={(e) => setViews(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cp-displays">Displays</Label>
                <Input
                  id="cp-displays"
                  type="number"
                  min="0"
                  value={displays}
                  onChange={(e) => setDisplays(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cp-clicks">Clicks</Label>
                <Input
                  id="cp-clicks"
                  type="number"
                  min="0"
                  value={clicks}
                  onChange={(e) => setClicks(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatusV2)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-paid">Paid date</Label>
              <DatePicker id="cp-paid" value={paidAt} onChange={(v) => setPaidAt(v ?? "")} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-inv">Invoice URL</Label>
            <div className="flex gap-2">
              <Input
                id="cp-inv"
                type="url"
                value={invoiceUrl}
                onChange={(e) => setInvoiceUrl(e.target.value)}
              />
              {invoiceUrl && (
                <Button type="button" size="icon" variant="outline" asChild title="Open invoice">
                  <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-notes">Notes</Label>
            <textarea
              id="cp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Live calc preview */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">
              Calculation
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {preview.cpm_gross > 0 && (
                <Stat label="CPM gross" value={formatUSD(preview.cpm_gross, { decimals: 2 })} />
              )}
              {preview.flat_gross > 0 && (
                <Stat label="Flat gross" value={formatUSD(preview.flat_gross, { decimals: 2 })} />
              )}
              <Stat label="Total gross" value={formatUSD(preview.gross, { decimals: 2 })} emphasised />
              {preview.views > 0 && <Stat label="CTR" value={`${preview.ctr_pct}%`} />}
              <Stat
                label={`Recast commission (${preview.effective_commission_pct}%)`}
                value={formatUSD(preview.recast_commission, { decimals: 2 })}
              />
              <Stat
                label="Creator take-home"
                value={formatUSD(preview.creator_take_home, { decimals: 2 })}
                emphasised
              />
            </dl>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasised ? "font-semibold" : ""}>{value}</dd>
    </>
  );
}
