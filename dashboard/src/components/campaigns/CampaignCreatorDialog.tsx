import * as React from "react";
import { UserPlus } from "lucide-react";
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
  useAddCampaignCreator,
  useUpdateCampaignCreator,
  type CampaignCreatorInput,
} from "@/hooks/useCampaignCreators";
import { useCreators } from "@/hooks/useCreators";
import { AddCreatorDialog } from "@/components/roster/AddCreatorDialog";
import type { CampaignCreatorV2 } from "@/types/finance";
import type { DealType } from "@/lib/finance/campaign-calc";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignId: string;
  defaultCommissionPct: number;
  campaignCreator: CampaignCreatorV2 | null;   // null = adding
}

export function CampaignCreatorDialog({
  open, onOpenChange, campaignId, defaultCommissionPct, campaignCreator,
}: Props) {
  const add = useAddCampaignCreator();
  const update = useUpdateCampaignCreator();
  const { data: creators, isLoading: creatorsLoading } = useCreators("signed");
  const [addCreatorOpen, setAddCreatorOpen] = React.useState(false);

  const [creatorId, setCreatorId] = React.useState("");
  const [dealType, setDealType] = React.useState<DealType>("cpm");
  const [cpmRate, setCpmRate] = React.useState<string>("");
  const [flatAmount, setFlatAmount] = React.useState<string>("");
  const [overrideOn, setOverrideOn] = React.useState(false);
  const [overridePct, setOverridePct] = React.useState<string>(String(defaultCommissionPct));
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;
    if (campaignCreator) {
      setCreatorId(campaignCreator.creator_id);
      setDealType((campaignCreator.deal_type as DealType) ?? "cpm");
      setCpmRate(campaignCreator.cpm_rate != null ? String(campaignCreator.cpm_rate) : "");
      setFlatAmount(campaignCreator.flat_amount != null ? String(campaignCreator.flat_amount) : "");
      setOverrideOn(campaignCreator.commission_pct != null);
      setOverridePct(
        campaignCreator.commission_pct != null
          ? String(campaignCreator.commission_pct)
          : String(defaultCommissionPct),
      );
      setStart(campaignCreator.start_date ?? "");
      setEnd(campaignCreator.end_date ?? "");
      setNotes(campaignCreator.notes ?? "");
    } else {
      setCreatorId("");
      setDealType("cpm");
      setCpmRate("");
      setFlatAmount("");
      setOverrideOn(false);
      setOverridePct(String(defaultCommissionPct));
      setStart("");
      setEnd("");
      setNotes("");
    }
  }, [open, campaignCreator, defaultCommissionPct]);

  async function onSave() {
    if (!creatorId) return toast.error("Pick a creator.");
    const input: CampaignCreatorInput = {
      campaign_id: campaignId,
      creator_id: creatorId,
      commission_pct: overrideOn && overridePct.trim() ? Number(overridePct) : null,
      start_date: start || null,
      end_date: end || null,
      deal_type: dealType,
      cpm_rate: cpmRate.trim() ? Number(cpmRate) : null,
      flat_amount: flatAmount.trim() ? Number(flatAmount) : null,
      notes: notes.trim() || null,
    };
    try {
      if (campaignCreator) {
        await update.mutateAsync({ id: campaignCreator.id, patch: input });
        toast.success("Deal updated");
      } else {
        await add.mutateAsync(input);
        toast.success("Creator added to campaign");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const submitting = add.isPending || update.isPending;
  const showCpm = dealType === "cpm" || dealType === "hybrid";
  const showFlat = dealType === "flat_fee" || dealType === "hybrid";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {campaignCreator ? "Edit creator deal" : "Add creator to campaign"}
          </DialogTitle>
          <DialogDescription>
            CPM is per 1,000 views. Flat fee is a one-off. Hybrid combines both.
            Commission % override beats the campaign default when set.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Creator *</Label>
            <div className="flex items-center gap-2">
              <Select value={creatorId} onValueChange={setCreatorId} disabled={!!campaignCreator}>
                <SelectTrigger>
                  <SelectValue placeholder={creatorsLoading ? "Loading…" : "Pick from Roster"} />
                </SelectTrigger>
                <SelectContent>
                  {(creators ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!campaignCreator && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setAddCreatorOpen(true)}
                  title="Create a new Roster creator"
                >
                  <UserPlus className="mr-1 h-4 w-4" /> New
                </Button>
              )}
            </div>
          </div>

          <AddCreatorDialog
            signed
            open={addCreatorOpen}
            onOpenChange={setAddCreatorOpen}
            onCreated={(id) => setCreatorId(id)}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Deal type</Label>
              <Select value={dealType} onValueChange={(v) => setDealType(v as DealType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpm">CPM</SelectItem>
                  <SelectItem value="flat_fee">Flat fee</SelectItem>
                  <SelectItem value="hybrid">Hybrid (CPM + flat)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showCpm && (
              <div className="grid gap-1.5">
                <Label htmlFor="cc-cpm">CPM rate ($/1k views)</Label>
                <Input
                  id="cc-cpm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={cpmRate}
                  onChange={(e) => setCpmRate(e.target.value)}
                />
              </div>
            )}
            {showFlat && (
              <div className="grid gap-1.5">
                <Label htmlFor="cc-flat">Flat amount ($)</Label>
                <Input
                  id="cc-flat"
                  type="number"
                  step="0.01"
                  min="0"
                  value={flatAmount}
                  onChange={(e) => setFlatAmount(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideOn}
                onChange={(e) => setOverrideOn(e.target.checked)}
              />
              Override commission % for this creator
              <span className="ml-auto text-xs text-muted-foreground">
                campaign default: {defaultCommissionPct}%
              </span>
            </label>
            {overrideOn && (
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={overridePct}
                onChange={(e) => setOverridePct(e.target.value)}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cc-start">Creator start date</Label>
              <DatePicker id="cc-start" value={start} onChange={(v) => setStart(v ?? "")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-end">Creator end date</Label>
              <DatePicker
                id="cc-end"
                value={end}
                onChange={(v) => setEnd(v ?? "")}
                minDate={start ? new Date(start) : undefined}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cc-notes">Notes</Label>
            <textarea
              id="cc-notes"
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
            {submitting ? "Saving…" : campaignCreator ? "Save changes" : "Add creator"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
