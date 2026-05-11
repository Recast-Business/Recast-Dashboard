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
  useAddResident,
  useUpdateResident,
  type ResidentInput,
} from "@/hooks/useHouse";
import type { HouseResident } from "@/types/finance";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  resident: HouseResident | null;
}

export function ResidentDialog({ open, onOpenChange, resident }: Props) {
  const add = useAddResident();
  const update = useUpdateResident();

  const [name, setName] = React.useState("");
  const [bedroom, setBedroom] = React.useState("");
  const [rent, setRent] = React.useState<string>("");
  const [active, setActive] = React.useState(true);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (resident) {
      setName(resident.name);
      setBedroom(resident.bedroom);
      setRent(String(resident.monthly_rent));
      setActive(resident.active);
      setNotes(resident.notes ?? "");
    } else {
      setName("");
      setBedroom("");
      setRent("");
      setActive(true);
      setNotes("");
    }
  }, [open, resident]);

  async function onSave() {
    if (!name.trim()) return toast.error("Name is required.");
    if (!bedroom.trim()) return toast.error("Bedroom label is required.");
    const rentNum = Number(rent);
    if (!rent || Number.isNaN(rentNum) || rentNum < 0) return toast.error("Rent must be a non-negative number.");

    const input: ResidentInput = {
      name: name.trim(),
      bedroom: bedroom.trim(),
      monthly_rent: rentNum,
      active,
      notes: notes.trim() || null,
    };
    try {
      if (resident) {
        await update.mutateAsync({ id: resident.id, patch: input });
        toast.success("Resident updated");
      } else {
        await add.mutateAsync(input);
        toast.success("Resident added");
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
          <DialogTitle>{resident ? "Edit resident" : "Add resident"}</DialogTitle>
          <DialogDescription>
            Active residents are included in equal-per-head utility splits.
            Set inactive when someone moves out instead of deleting.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-bedroom">Bedroom</Label>
              <Input id="r-bedroom" value={bedroom} onChange={(e) => setBedroom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-rent">Monthly rent</Label>
              <Input
                id="r-rent"
                type="number"
                step="0.01"
                min="0"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-notes">Notes</Label>
            <textarea
              id="r-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active resident (counted in utility splits)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Saving…" : resident ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
