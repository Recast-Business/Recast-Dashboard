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
  useUpsertRentPayment,
  useUpsertUtilityPayment,
} from "@/hooks/useHouse";
import type {
  HouseRentPayment,
  HouseUtilityPayment,
} from "@/types/finance";
import { formatUSD } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Mode =
  | {
      // Phase M-2: rent cells are now keyed by rent_group_id, not resident_id.
      // The label is the group's display name (e.g. "Frazier", "Harriet & Keenan").
      kind: "rent";
      rentGroupId: string;
      groupLabel: string;
      defaultRent: number;
      existing: HouseRentPayment | null;
    }
  | {
      kind: "utility";
      utilityId: string;
      utilityName: string;
      activeResidentCount: number; // for the per-head split preview
      existing: HouseUtilityPayment | null;
    };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year: number;
  month: number;
  mode: Mode;
}

export function HouseCellDialog({ open, onOpenChange, year, month, mode }: Props) {
  const upsertRent = useUpsertRentPayment();
  const upsertUtility = useUpsertUtilityPayment();

  const existing = mode.existing;
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setAmount(
      existing?.amount != null
        ? String(existing.amount)
        : mode.kind === "rent"
        ? String(mode.defaultRent)
        : "",
    );
    setNotes(existing?.notes ?? "");
  }, [open, existing, mode]);

  async function onSave() {
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum < 0) {
      toast.error("Amount must be a non-negative number.");
      return;
    }
    try {
      if (mode.kind === "rent") {
        await upsertRent.mutateAsync({
          rent_group_id: mode.rentGroupId,
          period_year: year,
          period_month: month,
          amount: amountNum,
          notes: notes.trim() || null,
        });
      } else {
        await upsertUtility.mutateAsync({
          utility_id: mode.utilityId,
          period_year: year,
          period_month: month,
          amount: amountNum,
          notes: notes.trim() || null,
        });
      }
      toast.success(`${MONTH_NAMES[month - 1]} ${year} updated`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const submitting = upsertRent.isPending || upsertUtility.isPending;
  // Floor-each + remainder-to-Frazier algorithm so the column reconciles.
  // For the preview we just show the two values: "base" (everyone else) and
  // "Frazier's share" (which absorbs any leftover cents).
  const splitBase =
    mode.kind === "utility" && mode.activeResidentCount > 0 && Number(amount) > 0
      ? Math.floor((Number(amount) * 100) / mode.activeResidentCount) / 100
      : 0;
  const splitFrazier =
    mode.kind === "utility" && mode.activeResidentCount > 0 && Number(amount) > 0
      ? (Math.round(Number(amount) * 100) -
          Math.floor((Number(amount) * 100) / mode.activeResidentCount) *
            (mode.activeResidentCount - 1)) /
        100
      : 0;
  const splitPreview = splitBase;

  const title =
    mode.kind === "rent"
      ? `${mode.groupLabel} — ${MONTH_NAMES[month - 1]} ${year}`
      : `${mode.utilityName} — ${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode.kind === "rent"
              ? "Track this resident's rent payment for the month. Amount defaults to their monthly rent — override if they paid a different amount."
              : "Enter the bill amount for the month. The split per resident is computed live below."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="hc-amount">Amount</Label>
            <Input
              id="hc-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {/* Status auto-derives from logged receipts vs. the
              period's end-of-month deadline. Log a payment in the
              Frazier's House log to mark this period paid; no
              manual flip needed. */}
          <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
            Status auto-derives from the payment log + this month's
            due date. Log a payment in the Frazier's House panel to
            mark this cell paid; once the month ends with no
            payment, it flips to overdue.
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="hc-notes">Notes</Label>
            <textarea
              id="hc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {mode.kind === "utility" && splitPreview > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="text-muted-foreground">
                Split across {mode.activeResidentCount} active resident
                {mode.activeResidentCount === 1 ? "" : "s"}
              </div>
              {splitBase === splitFrazier ? (
                <div className="text-base font-semibold tabular-nums">
                  {formatUSD(splitBase, { decimals: 2 })} per person
                </div>
              ) : (
                <>
                  <div className="text-base font-semibold tabular-nums">
                    {formatUSD(splitBase, { decimals: 2 })} per person ·{" "}
                    {formatUSD(splitFrazier, { decimals: 2 })} for Frazier
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Cent remainder goes to Frazier so the split reconciles.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
