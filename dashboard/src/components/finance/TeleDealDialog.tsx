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
  useAddTeleDeal,
  useUpdateTeleDeal,
  type TeleDealInput,
} from "@/hooks/useTeleDeals";
import { useCreators } from "@/hooks/useCreators";
import { AddCreatorDialog } from "@/components/roster/AddCreatorDialog";
import { DatePicker } from "@/components/ui/date-picker";
import { UserPlus } from "lucide-react";
import type { CommissionBasis, TeleDeal } from "@/types/finance";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: TeleDeal | null; // null = creating
  /** When creating, preselect this creator (e.g. from the orphan-rescue
   *  banner where the creator is already known). Ignored on edit. */
  prefilledCreatorId?: string;
}

export function TeleDealDialog({ open, onOpenChange, deal, prefilledCreatorId }: Props) {
  const add = useAddTeleDeal();
  const update = useUpdateTeleDeal();
  const { data: creators, isLoading: creatorsLoading } = useCreators("signed");
  const [addCreatorOpen, setAddCreatorOpen] = React.useState(false);

  const [creatorId, setCreatorId] = React.useState<string>("");
  const [pct, setPct] = React.useState<string>("20");

  // K-1: read commission % off the selected creator's profile.
  // Prefill applies only when CREATING a new deal (not editing existing).
  const selectedCreator = React.useMemo(
    () => (creators ?? []).find((c) => c.id === creatorId),
    [creators, creatorId],
  );
  // K-2: profile may be flat (number) or tiered (array). For the deal dialog,
  // we still snap a single % — the lowest tier's pct when tiered, the flat
  // value otherwise. Tiered profiles get a hint instead of a "matches/overriding"
  // line because the actual commission applies tier-by-tier at calc time.
  const { profilePct, profileIsTiered, tierSummary } = React.useMemo(() => {
    const map = (selectedCreator as any)?.commission_pct_by_platform;
    if (!map || typeof map !== "object") {
      return { profilePct: null as number | null, profileIsTiered: false, tierSummary: "" };
    }
    const v = map.telegram;
    if (typeof v === "number") {
      return { profilePct: v, profileIsTiered: false, tierSummary: "" };
    }
    if (Array.isArray(v) && v.length > 0) {
      const sorted = [...v].sort((a: any, b: any) => (a?.threshold ?? 0) - (b?.threshold ?? 0));
      const summary = sorted
        .map((t: any) => `${t.pct}%/$${Number(t.threshold).toLocaleString()}+`)
        .join(", ");
      return {
        profilePct: typeof sorted[0]?.pct === "number" ? sorted[0].pct : null,
        profileIsTiered: true,
        tierSummary: summary,
      };
    }
    return { profilePct: null as number | null, profileIsTiered: false, tierSummary: "" };
  }, [selectedCreator]);
  const [basis, setBasis] = React.useState<CommissionBasis>("net");
  const [hasMG, setHasMG] = React.useState(false);
  const [mg, setMg] = React.useState<string>("");
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    if (deal) {
      setCreatorId(deal.creator_id);
      setPct(String(deal.recast_commission_pct));
      setBasis(deal.commission_basis as CommissionBasis);
      setHasMG(deal.min_guarantee != null);
      setMg(deal.min_guarantee != null ? String(deal.min_guarantee) : "");
      setStart(deal.contract_start);
      setEnd(deal.contract_end);
      setNotes(deal.notes ?? "");
      setActive(deal.active);
    } else {
      setCreatorId(prefilledCreatorId ?? "");
      setPct("20");
      setBasis("net");
      setHasMG(false);
      setMg("");
      const today = new Date().toISOString().slice(0, 10);
      const sixMonthsLater = new Date();
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      setStart(today);
      setEnd(sixMonthsLater.toISOString().slice(0, 10));
      setNotes("");
      setActive(true);
    }
  }, [open, deal, prefilledCreatorId]);

  // K-1: When creating a new deal and the user picks a creator, snap the
  // commission % to whatever is on their profile. Editing an existing deal
  // never auto-snaps — keep the recorded contract value untouched.
  React.useEffect(() => {
    if (!open || deal) return;
    if (!creatorId) return;
    if (profilePct == null) return;
    setPct(String(profilePct));
  }, [open, deal, creatorId, profilePct]);

  async function onSave() {
    if (!creatorId) {
      toast.error("Pick a creator.");
      return;
    }
    if (!start || !end) {
      toast.error("Contract start and end dates are required.");
      return;
    }
    if (new Date(end) < new Date(start)) {
      toast.error("Contract end must be after start.");
      return;
    }
    const input: TeleDealInput = {
      creator_id: creatorId,
      recast_commission_pct: Number(pct) || 0,
      commission_basis: basis,
      min_guarantee: hasMG && mg.trim() ? Number(mg) : null,
      contract_start: start,
      contract_end: end,
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{deal ? "Edit Telegram deal" : "Add Telegram deal"}</DialogTitle>
          <DialogDescription>
            One deal per creator. Min Guarantee is optional. Performance is logged
            month-by-month after this deal exists.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
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
                  title="Create a new creator and add them to the Roster"
                >
                  <UserPlus className="mr-1 h-4 w-4" /> New
                </Button>
              )}
            </div>
            {deal ? (
              <p className="text-[11px] text-muted-foreground">
                Creator can't be changed after the deal is created. Delete + re-add to move.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Pulls from your signed Roster. Click New to create one inline — they'll be added to the Roster automatically.
              </p>
            )}
          </div>

          <AddCreatorDialog
            signed
            open={addCreatorOpen}
            onOpenChange={setAddCreatorOpen}
            onCreated={(id) => setCreatorId(id)}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="td-pct">Recast commission %</Label>
              <Input
                id="td-pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              {creatorId && profileIsTiered && (
                <p className="text-[11px] text-muted-foreground">
                  Tiered profile · {tierSummary}. The deal's flat % is ignored at
                  calc time — tiers apply per-month based on gross.
                </p>
              )}
              {creatorId && !profileIsTiered && profilePct != null && (
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
              {creatorId && profilePct == null && !profileIsTiered && !deal && (
                <p className="text-[11px] text-muted-foreground">
                  No Telegram % on this creator's profile — set one in Roster → Profile to auto-fill next time.
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

          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasMG}
                onChange={(e) => setHasMG(e.target.checked)}
              />
              Has Min Guarantee
            </label>
            {hasMG && (
              <div className="grid gap-1.5">
                <Label htmlFor="td-mg">MG amount (USD)</Label>
                <Input
                  id="td-mg"
                  type="number"
                  step="0.01"
                  min="0"
                  value={mg}
                  onChange={(e) => setMg(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Creator qualifies for top-up when their net is ≥ 50% of MG. Top-up
                  amount = MG − net. Recast still takes commission on (net + top-up).
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="td-start">Contract start</Label>
              <DatePicker id="td-start" value={start} onChange={(v) => setStart(v ?? "")} allowClear={false} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="td-end">Contract end</Label>
              <DatePicker id="td-end" value={end} onChange={(v) => setEnd(v ?? "")} allowClear={false} minDate={start ? new Date(start) : undefined} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="td-notes">Notes</Label>
            <textarea
              id="td-notes"
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
