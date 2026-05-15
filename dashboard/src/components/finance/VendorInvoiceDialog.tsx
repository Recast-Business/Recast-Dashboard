import * as React from "react";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  useAddVendorInvoice,
  useUpdateVendorInvoice,
} from "@/hooks/useVendorInvoices";
import type { VendorInvoice } from "@/types/finance";

/**
 * Phase K-4: Add or edit an ad-hoc vendor invoice.
 */

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendorId: string;
  vendorName: string;
  invoice: VendorInvoice | null; // null = creating
}

export function VendorInvoiceDialog({
  open,
  onOpenChange,
  vendorId,
  vendorName,
  invoice,
}: Props) {
  const add = useAddVendorInvoice();
  const update = useUpdateVendorInvoice();

  const today = new Date().toISOString().slice(0, 10);
  const defaultDue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const [description, setDescription] = React.useState("");
  const [issuedAt, setIssuedAt] = React.useState(today);
  const [dueDate, setDueDate] = React.useState(defaultDue);
  const [amount, setAmount] = React.useState("");
  const [invoiceUrl, setInvoiceUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (invoice) {
      setDescription(invoice.description);
      setIssuedAt(invoice.issued_at);
      setDueDate(invoice.due_date);
      setAmount(String(invoice.amount));
      setInvoiceUrl(invoice.invoice_url ?? "");
      setNotes(invoice.notes ?? "");
    } else {
      setDescription("");
      setIssuedAt(today);
      setDueDate(defaultDue);
      setAmount("");
      setInvoiceUrl("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  const submitting = add.isPending || update.isPending;

  async function onSave() {
    const desc = description.trim();
    if (!desc) {
      toast.error("Describe what the invoice is for.");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!issuedAt || !dueDate) {
      toast.error("Issued and due dates are required.");
      return;
    }
    if (new Date(dueDate) < new Date(issuedAt)) {
      toast.error("Due date must be on or after issue date.");
      return;
    }
    const body = {
      vendor_id: vendorId,
      description: desc,
      issued_at: issuedAt,
      due_date: dueDate,
      amount: num,
      invoice_url: invoiceUrl.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (invoice) {
        await update.mutateAsync({ id: invoice.id, vendor_id: vendorId, patch: body });
        toast.success("Invoice updated");
      } else {
        await add.mutateAsync(body);
        toast.success("Invoice added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            {invoice ? "Edit invoice" : "New invoice"} — {vendorName}
          </DialogTitle>
          <DialogDescription>
            One-off bill outside the recurring monthly grid. Has its own due
            date — surfaces in the Overdue banner if not paid by then.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="vi-description">Description *</Label>
            <Input
              id="vi-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="vi-issued">Issued *</Label>
              <DatePicker
                id="vi-issued"
                value={issuedAt}
                onChange={(v) => setIssuedAt(v ?? "")}
                allowClear={false}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vi-due">Due *</Label>
              <DatePicker
                id="vi-due"
                value={dueDate}
                onChange={(v) => setDueDate(v ?? "")}
                allowClear={false}
                minDate={issuedAt ? new Date(issuedAt) : undefined}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vi-amount">Amount (USD) *</Label>
              <Input
                id="vi-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="vi-url">Invoice URL</Label>
            <Input
              id="vi-url"
              type="url"
              value={invoiceUrl}
              onChange={(e) => setInvoiceUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="vi-notes">Notes</Label>
            <textarea
              id="vi-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Optional context."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Saving…" : invoice ? "Save changes" : "Add invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
