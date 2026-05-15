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
import { useUpsertCampaignPayment } from "@/hooks/useCampaignPayments";
import { useViewCampaignFinancials } from "@/auth/useRole";
import {
  calcAdOverlay,
  calcCampaignDeal,
  type DealType,
} from "@/lib/finance/campaign-calc";
import { formatUSD } from "@/lib/utils";
import type {
  CampaignCreatorV2,
  CampaignPayment,
  CampaignV2,
} from "@/types/finance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Parent campaign — the Ad Overlay branch reads campaign_type +
   *  the campaign-level rate card (cpm_rate, ad_frequency_per_hr). */
  campaign: CampaignV2;
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
  open, onOpenChange, campaign, campaignCreator: cc, defaultCommissionPct,
  year, month, existing,
}: Props) {
  const upsert = useUpsertCampaignPayment();
  const seeFinancials = useViewCampaignFinancials();
  const isAdOverlay = campaign.campaign_type === "Ad Overlay";

  // Local working copies of the metrics for THIS month. We don't update
  // the rolling totals on campaign_creators from here — those reflect
  // the deal lifetime; this row is a per-month checkpoint.
  //
  // Non-AO deals: views / displays / clicks (rederived each open).
  // AO deals: ccv + airtime hr/min — persisted on campaign_payments
  // so the dialog can show them back next time.
  const [views, setViews] = React.useState("");
  const [displays, setDisplays] = React.useState("");
  const [clicks, setClicks] = React.useState("");
  const [ccv, setCcv] = React.useState("");
  const [airtimeHr, setAirtimeHr] = React.useState("");
  const [airtimeMin, setAirtimeMin] = React.useState("");
  const [invoiceUrl, setInvoiceUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setViews("");
    setDisplays("");
    setClicks("");
    setCcv(existing?.ccv != null ? String(existing.ccv) : "");
    if (existing?.airtime_minutes != null) {
      setAirtimeHr(String(Math.floor(existing.airtime_minutes / 60)));
      setAirtimeMin(String(existing.airtime_minutes % 60));
    } else {
      setAirtimeHr("");
      setAirtimeMin("");
    }
    setInvoiceUrl(existing?.invoice_url ?? "");
    setNotes(existing?.notes ?? "");
  }, [open, existing]);

  const viewsNum = Number(views) || 0;
  const clicksNum = Number(clicks) || 0;
  const displaysNum = Number(displays) || 0;
  const ccvNum = Number(ccv) || 0;
  const airtimeMinutesNum =
    (Number(airtimeHr) || 0) * 60 + (Number(airtimeMin) || 0);

  const standardPreview = React.useMemo(
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

  const overlayPreview = React.useMemo(
    () =>
      calcAdOverlay({
        cpm_rate: campaign.cpm_rate,
        ad_frequency_per_hr: campaign.ad_frequency_per_hr,
        ccv: ccvNum,
        airtime_minutes: airtimeMinutesNum,
        override_commission_pct: cc.commission_pct,
        default_commission_pct: defaultCommissionPct,
      }),
    [campaign, cc.commission_pct, ccvNum, airtimeMinutesNum, defaultCommissionPct],
  );

  async function onSave() {
    try {
      if (isAdOverlay) {
        await upsert.mutateAsync({
          campaign_creator_id: cc.id,
          period_year: year,
          period_month: month,
          amount: overlayPreview.gross,
          invoice_url: invoiceUrl.trim() || null,
          notes: notes.trim() || null,
          ccv: ccvNum > 0 ? ccvNum : null,
          airtime_minutes: airtimeMinutesNum > 0 ? airtimeMinutesNum : null,
        });
      } else {
        await upsert.mutateAsync({
          campaign_creator_id: cc.id,
          period_year: year,
          period_month: month,
          amount: standardPreview.gross,
          invoice_url: invoiceUrl.trim() || null,
          notes: notes.trim() || null,
        });
      }
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
          {isAdOverlay ? (
            <>
              {/* Campaign rate card — read-only context. Edited on
                  the campaign itself, not the period cell. */}
              {seeFinancials && (
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 text-xs">
                  <Stat
                    label="Campaign CPM"
                    value={
                      campaign.cpm_rate != null
                        ? `$${campaign.cpm_rate} / 1k`
                        : "—"
                    }
                  />
                  <Stat
                    label="Ad frequency"
                    value={
                      campaign.ad_frequency_per_hr != null
                        ? `${campaign.ad_frequency_per_hr} ads/hr`
                        : "—"
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cp-ccv">CCV (avg viewers)</Label>
                  <Input
                    id="cp-ccv"
                    type="number"
                    min="0"
                    value={ccv}
                    onChange={(e) => setCcv(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cp-airhr">Airtime hr</Label>
                  <Input
                    id="cp-airhr"
                    type="number"
                    min="0"
                    value={airtimeHr}
                    onChange={(e) => setAirtimeHr(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cp-airmin">Airtime min</Label>
                  <Input
                    id="cp-airmin"
                    type="number"
                    min="0"
                    max="59"
                    value={airtimeMin}
                    onChange={(e) => setAirtimeMin(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            (cc.deal_type === "cpm" || cc.deal_type === "hybrid") && (
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
            )
          )}

          {seeFinancials && (
            <>
              <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
                Status derives automatically from logged receipts vs.
                the month-end deadline. Log a payment from the
                <strong className="text-foreground"> Payments </strong>
                page to mark this cell paid; flipping a status manually
                no longer drives Overview or the receipts log.
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
            </>
          )}

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

          {/* Live calc preview — operators without financial visibility see only metrics */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">
              {seeFinancials ? "Calculation" : "Metrics"}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {isAdOverlay ? (
                seeFinancials ? (
                  <>
                    <Stat
                      label="Per ad airing"
                      value={formatUSD(overlayPreview.per_ad, { decimals: 2 })}
                    />
                    <Stat
                      label="Per hour"
                      value={formatUSD(overlayPreview.per_hour, { decimals: 2 })}
                    />
                    <Stat
                      label="Monthly gross"
                      value={formatUSD(overlayPreview.gross, { decimals: 2 })}
                      emphasised
                    />
                    <Stat
                      label={`Recast commission (${overlayPreview.effective_commission_pct}%)`}
                      value={formatUSD(overlayPreview.recast_commission, { decimals: 2 })}
                    />
                    <Stat
                      label="Creator take-home"
                      value={formatUSD(overlayPreview.creator_take_home, { decimals: 2 })}
                      emphasised
                    />
                  </>
                ) : (
                  <dt className="col-span-2 text-muted-foreground">
                    Financial figures hidden by your role.
                  </dt>
                )
              ) : (
                <>
                  {seeFinancials && standardPreview.cpm_gross > 0 && (
                    <Stat label="CPM gross" value={formatUSD(standardPreview.cpm_gross, { decimals: 2 })} />
                  )}
                  {seeFinancials && standardPreview.flat_gross > 0 && (
                    <Stat label="Flat gross" value={formatUSD(standardPreview.flat_gross, { decimals: 2 })} />
                  )}
                  {seeFinancials && (
                    <Stat
                      label="Total gross"
                      value={formatUSD(standardPreview.gross, { decimals: 2 })}
                      emphasised
                    />
                  )}
                  {standardPreview.views > 0 && <Stat label="CTR" value={`${standardPreview.ctr_pct}%`} />}
                  {seeFinancials && (
                    <>
                      <Stat
                        label={`Recast commission (${standardPreview.effective_commission_pct}%)`}
                        value={formatUSD(standardPreview.recast_commission, { decimals: 2 })}
                      />
                      <Stat
                        label="Creator take-home"
                        value={formatUSD(standardPreview.creator_take_home, { decimals: 2 })}
                        emphasised
                      />
                    </>
                  )}
                  {!seeFinancials && (
                    <dt className="col-span-2 text-muted-foreground">
                      Financial figures hidden by your role.
                    </dt>
                  )}
                </>
              )}
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
