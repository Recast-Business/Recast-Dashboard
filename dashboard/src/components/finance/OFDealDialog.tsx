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
import {
  useAddOFDeal,
  useUpdateOFDeal,
  type OFDealInput,
} from "@/hooks/useOFDeals";
import { useCreators } from "@/hooks/useCreators";
import { AddCreatorDialog } from "@/components/roster/AddCreatorDialog";
import { UserPlus } from "lucide-react";
import type { CommissionBasis, OFDeal } from "@/types/finance";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: OFDeal | null;
}

export function OFDealDialog({ open, onOpenChange, deal }: Props) {
  const add = useAddOFDeal();
  const update = useUpdateOFDeal();
  const { data: creators, isLoading: creatorsLoading } = useCreators("signed");
  const [addCreatorOpen, setAddCreatorOpen] = React.useState(false);

  const [creatorId, setCreatorId] = React.useState("");
  const [pageName, setPageName] = React.useState("");
  const [pct, setPct] = React.useState("50");
  const [basis, setBasis] = React.useState<CommissionBasis>("net");
  const [notes, setNotes] = React.useState("");
  const [active, setActive] = React.useState(true);

  // K-1: read commission % off the selected creator's profile.
  // Prefill applies only when CREATING a new deal (not editing existing).
  const selectedCreator = React.useMemo(
    () => (creators ?? []).find((c) => c.id === creatorId),
    [creators, creatorId],
  );
  const profilePct = React.useMemo<number | null>(() => {
    const map = (selectedCreator as any)?.commission_pct_by_platform;
    if (!map || typeof map !== "object") return null;
    const v = map.onlyfans;
    return typeof v === "number" ? v : null;
  }, [selectedCreator]);

  React.useEffect(() => {
    if (!open) return;
    if (deal) {
      setCreatorId(deal.creator_id);
      setPageName(deal.page_name);
      setPct(String(deal.recast_pct));
      setBasis(deal.basis as CommissionBasis);
      setNotes(deal.notes ?? "");
      setActive(deal.active);
    } else {
      setCreatorId("");
      setPageName("");
      setPct("50");
      setBasis("net");
      setNotes("");
      setActive(true);
    }
  }, [open, deal]);

  // K-1: When creating a new deal and the user picks a creator, snap the
  // commission % to whatever is on their profile. Editing never auto-snaps.
  React.useEffect(() => {
    if (!open || deal) return;
    if (!creatorId) return;
    if (profilePct == null) return;
    setPct(String(profilePct));
  }, [open, deal, creatorId, profilePct]);

  async function onSave() {
    if (!creatorId) return toast.error("Pick a creator.");
    if (!pageName.trim()) return toast.error("Page name is required.");
    const input: OFDealInput = {
      creator_id: creatorId,
      page_name: pageName.trim(),
      recast_pct: Number(pct) || 0,
      basis,
      active,
      notes: notes.trim() || null,
    };
    try {
      if (deal) {
        await update.mutateAsync({ id: deal.id, patch: input });
        toast.success("Deal updated");
      } else {
        await add.mutateAsync(input);
        toast.success("Deal added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const submitting = add.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{deal ? "Edit OF page deal" : "Add OF page deal"}</DialogTitle>
          <DialogDescription>
            One deal per (creator, page name). A creator can have multiple pages
            — add a row for each.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Creator *</Label>
              <div className="flex items-center gap-2">
                <Select value={creatorId} onValueChange={setCreatorId} disabled={!!deal}>
                  <SelectTrigger>
                    <SelectValue placeholder={creatorsLoading ? "Loading…" : "Pick from Roster"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(creators ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!deal && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setAddCreatorOpen(true)}
                    title="Create a new creator"
                  >
                    <UserPlus className="mr-1 h-4 w-4" /> New
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-page">Page name *</Label>
              <Input
                id="of-page"
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
              />
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
              <Label htmlFor="of-pct">Recast %</Label>
              <Input
                id="of-pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              {creatorId && profilePct != null && (
                <p className="text-[11px] text-muted-foreground">
                  {Number(pct) === profilePct ? (
                    <>From profile ({profilePct}%).</>
                  ) : (
                    <>
                      Overriding profile default ({profilePct}%).{" "}
                      <button
                        type="button"
                        className="underline hover:text-foreground"
                        onClick={() => setPct(String(profilePct))}
                      >
                        Reset
                      </button>
                    </>
                  )}
                </p>
              )}
              {creatorId && profilePct == null && !deal && (
                <p className="text-[11px] text-muted-foreground">
                  No OnlyFans % on this creator's profile — set one in Roster → Profile to auto-fill next time.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Commission on</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as CommissionBasis)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="net">Net</SelectItem>
                  <SelectItem value="gross">Gross</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Active</Label>
              <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active
              </label>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="of-notes">Notes</Label>
            <textarea
              id="of-notes"
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
            {submitting ? "Saving…" : deal ? "Save changes" : "Add deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
