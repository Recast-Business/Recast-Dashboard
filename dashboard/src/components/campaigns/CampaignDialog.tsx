import * as React from "react";
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
import {
  useAddCampaign,
  useUpdateCampaign,
  type CampaignInput,
} from "@/hooks/useCampaigns";
import { useViewCampaignFinancials } from "@/auth/useRole";
import type { CampaignStatusV2, CampaignV2 } from "@/types/finance";

const TYPE_OPTIONS = [
  "Partnership",
  "Ad Overlay",
  "One-off",
  "Affiliate",
  "Tournament",
  "Brand Ambassador",
];

// R5 Sweep 1: STATUS_OPTIONS removed — Status field dropped from the
// form. Status changes happen via card actions post-creation.

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: CampaignV2 | null;
}

export function CampaignDialog({ open, onOpenChange, campaign }: Props) {
  const add = useAddCampaign();
  const update = useUpdateCampaign();
  const seeFinancials = useViewCampaignFinancials();

  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [campaignType, setCampaignType] = React.useState<string>("");
  // R5 Sweep 1 (Gustavo, T1): Status field removed from the form
  // (defaults to 'pending' on creation; editable via card actions
  // post-creation). Preserve the value on edit so we don't blow it
  // away.
  const [statusInternal, setStatusInternal] = React.useState<CampaignStatusV2>("pending");
  const [defaultPct, setDefaultPct] = React.useState<string>("20");
  const [start, setStart] = React.useState<string>("");
  // R5 Sweep 1 (Gustavo, T2): End date dropped from the form —
  // campaigns are deliverables-based, not date-bounded. Existing
  // end_date values preserved on edit via endInternal so we don't
  // overwrite them.
  const [endInternal, setEndInternal] = React.useState<string>("");
  // R5 Sweep 1 (Gustavo, T2): Deliverables count replaces end_date as
  // the "how much work" signal. Optional.
  const [deliverablesCount, setDeliverablesCount] = React.useState<string>("");
  // Ad Overlay rate card — both editable while the type select is
  // 'Ad Overlay', cleared (null) for every other type.
  const [cpmRate, setCpmRate] = React.useState<string>("");
  const [adFrequencyPerHr, setAdFrequencyPerHr] = React.useState<string>("");
  const [description, setDescription] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (campaign) {
      setName(campaign.name);
      setBrand(campaign.brand);
      setCampaignType(campaign.campaign_type ?? "");
      setStatusInternal(campaign.status);
      setDefaultPct(String(campaign.default_commission_pct));
      setStart(campaign.start_date ?? "");
      setEndInternal(campaign.end_date ?? "");
      setDeliverablesCount(
        campaign.deliverables_count != null ? String(campaign.deliverables_count) : "",
      );
      setCpmRate(campaign.cpm_rate != null ? String(campaign.cpm_rate) : "");
      setAdFrequencyPerHr(
        campaign.ad_frequency_per_hr != null ? String(campaign.ad_frequency_per_hr) : "",
      );
      setDescription(campaign.description ?? "");
      setNotes(campaign.notes ?? "");
    } else {
      setName("");
      setBrand("");
      setCampaignType("");
      setStatusInternal("pending");
      setDefaultPct("20");
      setStart("");
      setEndInternal("");
      setDeliverablesCount("");
      setCpmRate("");
      setAdFrequencyPerHr("");
      setDescription("");
      setNotes("");
    }
  }, [open, campaign]);

  async function onSave() {
    if (!name.trim()) return toast.error("Campaign name is required.");
    if (!brand.trim()) return toast.error("Brand is required.");
    const pct = Number(defaultPct);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) return toast.error("Default commission % must be between 0 and 100.");

    const deliverablesNum = deliverablesCount.trim() === "" ? null : Number(deliverablesCount);
    if (deliverablesNum != null && (!Number.isFinite(deliverablesNum) || deliverablesNum < 0)) {
      return toast.error("Deliverables count must be a non-negative number.");
    }

    // Ad Overlay rate card only persists when the campaign actually IS
    // an Ad Overlay — clears to null on every other type so the columns
    // don't carry stale values.
    const isAdOverlay = campaignType.trim() === "Ad Overlay";
    const cpmNum = cpmRate.trim() === "" ? null : Number(cpmRate);
    const adFreqNum = adFrequencyPerHr.trim() === "" ? null : Number(adFrequencyPerHr);
    if (isAdOverlay) {
      if (cpmNum != null && (!Number.isFinite(cpmNum) || cpmNum < 0)) {
        return toast.error("CPM rate must be a non-negative number.");
      }
      if (adFreqNum != null && (!Number.isFinite(adFreqNum) || adFreqNum < 0)) {
        return toast.error("Ad frequency must be a non-negative number.");
      }
    }

    const input: CampaignInput = {
      name: name.trim(),
      brand: brand.trim(),
      campaign_type: campaignType.trim() || null,
      // R5 Sweep 1: status preserved from existing (or default 'pending'
      // on create) — no longer surfaced in the form.
      status: statusInternal,
      default_commission_pct: pct,
      description: description.trim() || null,
      start_date: start || null,
      // R5 Sweep 1: end_date preserved on edit; not exposed in the form.
      end_date: endInternal || null,
      deliverables_count: deliverablesNum,
      cpm_rate: isAdOverlay ? cpmNum : null,
      ad_frequency_per_hr: isAdOverlay ? adFreqNum : null,
      notes: notes.trim() || null,
    };

    try {
      if (campaign) {
        await update.mutateAsync({ id: campaign.id, patch: input });
        toast.success("Campaign updated");
      } else {
        await add.mutateAsync(input);
        toast.success("Campaign added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const submitting = add.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "Add campaign"}</DialogTitle>
          <DialogDescription>
            Default commission % is the fallback when a creator on this campaign
            doesn't have a per-creator override.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-brand">Brand *</Label>
              <Input id="c-brand" value={brand} onChange={(e) => setBrand(e.target.value)} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">Campaign name *</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* R5 Sweep 1 (Gustavo, T1): Status field removed —
                "I don't think this is necessary, though... you're just
                putting in data". Status defaults to 'pending' on
                creation and is changed via the campaign-card actions
                post-creation. */}
            <div className="grid gap-1.5">
              <Label htmlFor="c-deliverables">
                Deliverables <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="c-deliverables"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={deliverablesCount}
                onChange={(e) => setDeliverablesCount(e.target.value)}
              />
            </div>
            {seeFinancials ? (
              <div className="grid gap-1.5">
                <Label htmlFor="c-pct">Default commission %</Label>
                <Input
                  id="c-pct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={defaultPct}
                  onChange={(e) => setDefaultPct(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Default commission %</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground">
                  Hidden by your role
                </div>
              </div>
            )}
          </div>

          {/* R5 Sweep 1 (Gustavo, T2): End date dropped from the
              form. "There's no start date. It's usually how many
              posts you make" — campaigns are deliverables-based.
              Start date kept as optional since some deals do have
              clear start days. */}
          <div className="grid gap-1.5">
            <Label htmlFor="c-start">
              Start date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <DatePicker id="c-start" value={start} onChange={(v) => setStart(v ?? "")} />
          </div>

          {/* Ad Overlay rate card — only surfaces when Type = Ad
              Overlay. CPM + ad frequency live on the campaign so
              every attached creator inherits the same rate; per-
              creator CCV + airtime are entered on the period cell. */}
          {campaignType.trim() === "Ad Overlay" ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-card/60 p-3">
              <div className="grid gap-1.5">
                <Label htmlFor="c-cpm">CPM rate ($ per 1,000 viewers)</Label>
                <Input
                  id="c-cpm"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={cpmRate}
                  onChange={(e) => setCpmRate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-adfreq">Ad frequency (ads / hr)</Label>
                <Input
                  id="c-adfreq"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={adFrequencyPerHr}
                  onChange={(e) => setAdFrequencyPerHr(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="c-desc">Description</Label>
            <textarea
              id="c-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="c-notes">Notes</Label>
            <textarea
              id="c-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Saving…" : campaign ? "Save changes" : "Add campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
