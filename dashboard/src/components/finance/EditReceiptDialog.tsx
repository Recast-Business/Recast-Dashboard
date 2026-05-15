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
import { useEditReceipt } from "@/hooks/usePaymentReceipts";
import type { PaymentMethod, PaymentSource } from "@/types/finance";

/**
 * R5 follow-up (Gus) — edit-receipt dialog used by HousePaymentLogPanel.
 *
 * Fields: received_at, amount, method, reference, notes. If the user
 * changes the amount, useEditReceipt wipes existing allocations and
 * re-runs allocate_fifo so the receipt re-spreads across the
 * obligor's oldest unpaid periods. The dialog itself doesn't know
 * about that — it just collects edits and dispatches.
 */

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "auto_pay", label: "Auto-pay" },
  { value: "bank_ach", label: "Bank / ACH" },
  { value: "domestic_wire", label: "Domestic wire" },
  { value: "international_transfer", label: "International transfer" },
  { value: "zelle", label: "Zelle" },
  { value: "paypal", label: "PayPal" },
  { value: "credit_card", label: "Credit card" },
  { value: "invoice_link", label: "Invoice link" },
  { value: "website_link", label: "Website link" },
];

interface ReceiptForEdit {
  id: string;
  source: PaymentSource;
  received_at: string;
  amount: number;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  /** Display-only — what the receipt is for, surfaced in the dialog
   *  header so the user knows which row they're editing. */
  display_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receipt: ReceiptForEdit | null;
}

export function EditReceiptDialog({ open, onOpenChange, receipt }: Props) {
  const edit = useEditReceipt();
  const [receivedAt, setReceivedAt] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod | "">("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Rehydrate from the row on each open.
  React.useEffect(() => {
    if (!open || !receipt) return;
    setReceivedAt(receipt.received_at);
    setAmount(String(receipt.amount));
    setMethod(receipt.method ?? "");
    setReference(receipt.reference ?? "");
    setNotes(receipt.notes ?? "");
  }, [open, receipt]);

  async function onSubmit() {
    if (!receipt) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    if (!receivedAt) {
      toast.error("Pick a received date.");
      return;
    }
    try {
      await edit.mutateAsync({
        id: receipt.id,
        source: receipt.source,
        originalAmount: receipt.amount,
        received_at: receivedAt,
        amount: amt,
        method: method || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Receipt updated");
      onOpenChange(false);
    } catch {
      // useEditReceipt already toasts on error.
    }
  }

  if (!receipt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit receipt</DialogTitle>
          <DialogDescription className="text-[12px]">
            {receipt.display_name}. Changing the amount re-runs FIFO
            allocation against the obligor&apos;s oldest unpaid
            periods.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="er-date">Received *</Label>
              <Input
                id="er-date"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="er-amount">Amount (USD) *</Label>
              <Input
                id="er-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="er-method">Method</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod((v as PaymentMethod) || "")}
              >
                <SelectTrigger id="er-method">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="er-ref">Reference</Label>
              <Input
                id="er-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Wire id / check # / etc."
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="er-notes">Notes</Label>
            <textarea
              id="er-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={edit.isPending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={edit.isPending}>
            {edit.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
