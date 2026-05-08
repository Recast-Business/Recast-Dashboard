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
  useUpsertRentPayment,
  useUpsertUtilityPayment,
} from "@/hooks/useHouse";
import type {
  HouseRentPayment,
  HouseUtilityPayment,
  PaymentStatusV2,
} from "@/types/finance";
import { formatUSD } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Mode =
  | {
      kind: "rent";
      residentId: string;
      residentName: string;
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
  const [status, setStatus] = React.useState<PaymentStatusV2>("unpaid");
  const [paidAt, setPaidAt] = React.useState("");
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
    setStatus(existing?.status ?? "unpaid");
    setPaidAt(existing?.paid_at ?? "");
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
          resident_id: mode.residentId,
          period_year: year,
          period_month: month,
          amount: amountNum,
          status,
          paid_at: paidAt || null,
          notes: notes.trim() || null,
        });
      } else {
        await upsertUtility.mutateAsync({
          utility_id: mode.utilityId,
          period_year: year,
          period_month: month,
          amount: amountNum,
          status,
          paid_at: paidAt || null,
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
  const splitPreview =
    mode.kind === "utility" && mode.activeResidentCount > 0 && Number(amount)
      ? Number(amount) / mode.activeResidentCount
      : 0;

  const title =
    mode.kind === "rent"
      ? `${mode.residentName} — ${MONTH_NAMES[month - 1]} ${year}`
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatusV2)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="hc-paid">Paid date</Label>
            <DatePicker id="hc-paid" value={paidAt} onChange={(v) => setPaidAt(v ?? "")} />
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
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="text-muted-foreground">
                Split across {mode.activeResidentCount} active resident
                {mode.activeResidentCount === 1 ? "" : "s"}
              </div>
              <div className="text-base font-semibold tabular-nums">
                {formatUSD(splitPreview, { decimals: 2 })} per person
              </div>
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
