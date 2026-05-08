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
import type { CampaignStatusV2, CampaignV2 } from "@/types/finance";

const TYPE_OPTIONS = [
  "Partnership",
  "Ad Overlay",
  "One-off",
  "Affiliate",
  "Tournament",
  "Brand Ambassador",
];

const STATUS_OPTIONS: { value: CampaignStatusV2; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: CampaignV2 | null;
}

export function CampaignDialog({ open, onOpenChange, campaign }: Props) {
  const add = useAddCampaign();
  const update = useUpdateCampaign();

  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [campaignType, setCampaignType] = React.useState<string>("");
  const [status, setStatus] = React.useState<CampaignStatusV2>("pending");
  const [defaultPct, setDefaultPct] = React.useState<string>("20");
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [isAdOverlay, setIsAdOverlay] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (campaign) {
      setName(campaign.name);
      setBrand(campaign.brand);
      setCampaignType(campaign.campaign_type ?? "");
      setStatus(campaign.status);
      setDefaultPct(String(campaign.default_commission_pct));
      setStart(campaign.start_date ?? "");
      setEnd(campaign.end_date ?? "");
      setIsAdOverlay(campaign.is_ad_overlay);
      setDescription(campaign.description ?? "");
      setNotes(campaign.notes ?? "");
    } else {
      setName("");
      setBrand("");
      setCampaignType("");
      setStatus("pending");
      setDefaultPct("20");
      setStart("");
      setEnd("");
      setIsAdOverlay(false);
      setDescription("");
      setNotes("");
    }
  }, [open, campaign]);

  async function onSave() {
    if (!name.trim()) return toast.error("Campaign name is required.");
    if (!brand.trim()) return toast.error("Brand is required.");
    const pct = Number(defaultPct);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) return toast.error("Default commission % must be between 0 and 100.");

    const input: CampaignInput = {
      name: name.trim(),
      brand: brand.trim(),
      campaign_type: campaignType.trim() || null,
      status,
      default_commission_pct: pct,
      description: description.trim() || null,
      start_date: start || null,
      end_date: end || null,
      is_ad_overlay: isAdOverlay,
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
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CampaignStatusV2)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-start">Start date</Label>
              <DatePicker id="c-start" value={start} onChange={(v) => setStart(v ?? "")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-end">End date</Label>
              <DatePicker
                id="c-end"
                value={end}
                onChange={(v) => setEnd(v ?? "")}
                minDate={start ? new Date(start) : undefined}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdOverlay}
              onChange={(e) => setIsAdOverlay(e.target.checked)}
            />
            Ad overlay campaign
          </label>

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
