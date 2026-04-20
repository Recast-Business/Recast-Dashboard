import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCampaign, useUpdateCampaign } from "@/hooks/useBrands";
import type { CampaignRow } from "@/hooks/useCampaigns";
import type { CampaignStatus } from "@/types/database";

interface Props {
  campaign?: CampaignRow;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

export function AddCampaignDialog({ campaign, open: controlledOpen, onOpenChange }: Props = {}) {
  const isEdit = !!campaign;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [brand, setBrand] = React.useState(campaign?.brand?.name ?? "");
  const [name, setName] = React.useState(campaign?.name ?? "");
  const [type, setType] = React.useState(campaign?.type ?? "");
  const [commission, setCommission] = React.useState(
    campaign ? String(campaign.commission_rate) : "20",
  );
  const [adOverlay, setAdOverlay] = React.useState(campaign?.is_ad_overlay ?? false);
  const [status, setStatus] = React.useState<CampaignStatus>(campaign?.status ?? "active");

  React.useEffect(() => {
    if (!open) return;
    setBrand(campaign?.brand?.name ?? "");
    setName(campaign?.name ?? "");
    setType(campaign?.type ?? "");
    setCommission(campaign ? String(campaign.commission_rate) : "20");
    setAdOverlay(campaign?.is_ad_overlay ?? false);
    setStatus(campaign?.status ?? "active");
  }, [open, campaign]);

  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const mutation = isEdit ? update : create;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit && campaign) {
      await update.mutateAsync({
        id: campaign.id,
        brand_name: brand.trim(),
        campaign_name: name.trim(),
        commission_rate: Number(commission) || 20,
        is_ad_overlay: adOverlay,
        type: type.trim() || null,
        status,
      });
    } else {
      await create.mutateAsync({
        brand_name: brand.trim(),
        campaign_name: name.trim(),
        commission_rate: Number(commission) || 20,
        is_ad_overlay: adOverlay,
        type: type.trim() || null,
      });
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New campaign
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the brand, details, or status of this campaign."
              : "Brands are auto-created if they don't exist."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              required
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Fanatics"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Campaign name</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fanatics Overlay – April 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Input
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Partnership, Ad Overlay, One-off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="commission">Recast commission (%)</Label>
              <Input
                id="commission"
                type="number"
                min={0}
                max={100}
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ad overlay</Label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={adOverlay}
                  onChange={(e) => setAdOverlay(e.target.checked)}
                />
                Live CCV overlay campaign
              </label>
            </div>
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CampaignStatus)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mutation.error ? (
            <p className="text-sm text-destructive">
              {(mutation.error as Error).message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
