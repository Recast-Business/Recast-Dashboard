import * as React from "react";
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
} from "@/components/ui/dialog";
import { useLogPayment } from "@/hooks/usePayments";

interface Props {
  campaignCreatorId: string;
  campaignId: string;
  creatorName: string;
  cachedEarnings: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentLogDialog({
  campaignCreatorId,
  campaignId,
  creatorName,
  cachedEarnings,
  open,
  onOpenChange,
}: Props) {
  const log = useLogPayment();
  const [amount, setAmount] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayIso());
  const [periodStart, setPeriodStart] = React.useState("");
  const [periodEnd, setPeriodEnd] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [markPaid, setMarkPaid] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setAmount(cachedEarnings > 0 ? String(cachedEarnings) : "");
    setPaidAt(todayIso());
    setPeriodStart("");
    setPeriodEnd("");
    setNotes("");
    setMarkPaid(true);
  }, [open, cachedEarnings]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    await log.mutateAsync({
      campaign_creator_id: campaignCreatorId,
      campaign_id: campaignId,
      amount: numericAmount,
      paid_at: new Date(paidAt).toISOString(),
      period_start: periodStart || null,
      period_end: periodEnd || null,
      notes: notes.trim() || null,
      mark_paid: markPaid,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log payment — {creatorName}</DialogTitle>
          <DialogDescription>
            Records a payment against this creator's deal. Cached earnings:{" "}
            <strong>${cachedEarnings.toFixed(2)}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid_at">Paid date</Label>
              <Input
                id="paid_at"
                type="date"
                required
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="period_start">Period start (optional)</Label>
              <Input
                id="period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end">Period end (optional)</Label>
              <Input
                id="period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Wire from brand, ref #1234"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markPaid}
              onChange={(e) => setMarkPaid(e.target.checked)}
            />
            Also mark this deal as <strong>paid</strong>
          </label>
          {log.error ? (
            <p className="text-sm text-destructive">{(log.error as Error).message}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={log.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={log.isPending}>
              {log.isPending ? "Logging…" : "Log payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
