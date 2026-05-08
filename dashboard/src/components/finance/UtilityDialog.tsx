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
  useAddUtility,
  useUpdateUtility,
  type UtilityInput,
} from "@/hooks/useHouse";
import type { HouseUtility } from "@/types/finance";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  utility: HouseUtility | null;
}

export function UtilityDialog({ open, onOpenChange, utility }: Props) {
  const add = useAddUtility();
  const update = useUpdateUtility();

  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (utility) {
      setName(utility.utility_name);
      setActive(utility.active);
      setNotes(utility.notes ?? "");
    } else {
      setName("");
      setActive(true);
      setNotes("");
    }
  }, [open, utility]);

  async function onSave() {
    if (!name.trim()) return toast.error("Utility name is required.");
    const input: UtilityInput = {
      utility_name: name.trim(),
      active,
      notes: notes.trim() || null,
    };
    try {
      if (utility) {
        await update.mutateAsync({ id: utility.id, patch: input });
        toast.success("Utility updated");
      } else {
        await add.mutateAsync(input);
        toast.success("Utility added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const submitting = add.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{utility ? "Edit utility" : "Add utility"}</DialogTitle>
          <DialogDescription>
            Each utility has a monthly amount that's split equally across active residents.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="u-name">Utility name</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="u-notes">Notes</Label>
            <textarea
              id="u-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (still being billed)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Saving…" : utility ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
