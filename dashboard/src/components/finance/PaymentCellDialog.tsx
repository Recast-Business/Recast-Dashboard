import * as React from "react";
import { ExternalLink } from "lucide-react";
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
import { useUpsertVendorPayment } from "@/hooks/useVendorPayments";
import type { VendorPayment, PaymentStatusV2 } from "@/types/finance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendorId: string;
  year: number;
  month: number;
  existing: VendorPayment | null;
}

export function PaymentCellDialog({
  open, onOpenChange, vendorId, year, month, existing,
}: Props) {
  const upsert = useUpsertVendorPayment();
  const [status, setStatus] = React.useState<PaymentStatusV2>(existing?.status ?? "unpaid");
  const [amount, setAmount] = React.useState<string>(
    existing?.amount != null ? String(existing.amount) : "",
  );
  const [paidAt, setPaidAt] = React.useState<string>(existing?.paid_at ?? "");
  const [invoiceUrl, setInvoiceUrl] = React.useState<string>(existing?.invoice_url ?? "");
  const [notes, setNotes] = React.useState<string>(existing?.notes ?? "");

  React.useEffect(() => {
    if (!open) return;
    setStatus(existing?.status ?? "unpaid");
    setAmount(existing?.amount != null ? String(existing.amount) : "");
    setPaidAt(existing?.paid_at ?? "");
    setInvoiceUrl(existing?.invoice_url ?? "");
    setNotes(existing?.notes ?? "");
  }, [open, existing]);

  async function onSave() {
    try {
      await upsert.mutateAsync({
        vendor_id: vendorId,
        period_year: year,
        period_month: month,
        status,
        amount: amount.trim() === "" ? null : Number(amount),
        paid_at: paidAt || null,
        invoice_url: invoiceUrl.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`${MONTH_NAMES[month - 1]} ${year} updated`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{MONTH_NAMES[month - 1]} {year}</DialogTitle>
          <DialogDescription>
            Update payment status, amount, paid date, invoice link, and notes for this month.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-amount">Amount</Label>
              <Input
                id="pc-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-paid">Paid date</Label>
              <Input
                id="pc-paid"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pc-invoice">Invoice URL</Label>
            <div className="flex gap-2">
              <Input
                id="pc-invoice"
                type="url"
                value={invoiceUrl}
                onChange={(e) => setInvoiceUrl(e.target.value)}
                placeholder="https://…"
              />
              {invoiceUrl && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  asChild
                  title="Open invoice"
                >
                  <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pc-notes">Notes</Label>
            <textarea
              id="pc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
