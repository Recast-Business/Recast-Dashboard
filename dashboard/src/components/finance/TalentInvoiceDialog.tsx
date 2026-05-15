import * as React from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Receipt, RotateCcw, Trash2 } from "lucide-react";
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
  useAddTalentInvoice,
  useDeleteTalentInvoice,
  useSetTalentInvoiceStatus,
  useUpdateTalentInvoice,
} from "@/hooks/useTalentInvoices";
import { useCreators } from "@/hooks/useCreators";
import { useConfirm } from "@/hooks/useConfirm";
import type { TalentInvoice } from "@/types/finance";
import { cn, formatUSD, isMonthOpen } from "@/lib/utils";
import { useLockState } from "@/hooks/useLockState";

/**
 * Phase M-6: Add / edit a talent invoice.
 *
 * Per Gustavo: drop page_name, Recast %, Commission On, Active. The
 * invoice is at the creator level (not page); the math comes from the
 * Calculator. This dialog only collects the things he actually needs to
 * track per invoice.
 *
 * Fields:
 *   • Creator (locked when editing)
 *   • Period — year + month
 *   • Invoice number (optional but normally filled)
 *   • Amount
 *   • Due date
 *   • Invoice URL — rendered as a Sheets-style blue link when present
 *   • Status / Mark Paid / Reopen
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// PAYMENT_METHODS list omitted — Mark Paid currently flips status without
// asking for a method (the field stays editable in the DB and surfaces in
// the read-only summary panel below). If Frazier wants to capture method
// at mark-paid time, M-7 can add a small "Mark paid…" sub-dialog.

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: TalentInvoice | null;       // null = creating
  /** When creating, optionally preselect a creator + month */
  defaultCreatorId?: string;
  defaultYear?: number;
  defaultMonth?: number;
}

export function TalentInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  defaultCreatorId,
  defaultYear,
  defaultMonth,
}: Props) {
  const add = useAddTalentInvoice();
  const update = useUpdateTalentInvoice();
  const del = useDeleteTalentInvoice();
  const setStatus = useSetTalentInvoiceStatus();
  const confirm = useConfirm();
  const { data: creators, isLoading: creatorsLoading } = useCreators("signed");

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const defaultDue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const [creatorId, setCreatorId] = React.useState("");
  const [year, setYear] = React.useState(defaultYear ?? today.getFullYear());
  const [month, setMonth] = React.useState(defaultMonth ?? today.getMonth() + 1);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState(defaultDue);
  const [invoiceUrl, setInvoiceUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (invoice) {
      setCreatorId(invoice.creator_id);
      setYear(invoice.period_year);
      setMonth(invoice.period_month);
      setInvoiceNumber(invoice.invoice_number ?? "");
      setAmount(String(invoice.amount));
      setDueDate(invoice.due_date);
      setInvoiceUrl(invoice.invoice_url ?? "");
      setNotes(invoice.notes ?? "");
    } else {
      setCreatorId(defaultCreatorId ?? "");
      setYear(defaultYear ?? today.getFullYear());
      setMonth(defaultMonth ?? today.getMonth() + 1);
      setInvoiceNumber("");
      setAmount("");
      setDueDate(defaultDue);
      setInvoiceUrl("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice, defaultCreatorId, defaultYear, defaultMonth]);

  const submitting = add.isPending || update.isPending;
  const lock = useLockState();

  // R3D.2: creating a NEW invoice requires the chosen period to be
  // open (current/future) OR explicitly unlocked.
  // R4.A.2: editing an EXISTING invoice in a >6-month-old period
  // requires an unlock too.
  const periodLocked = invoice
    ? !lock.canEdit(year, month)
    : !lock.canCreate(year, month);
  // Used for the legacy "past months locked" copy when no unlock is
  // present — distinguishes R3D.2 (past-month) from R4.A.2 (6mo+).
  const reason: "past-month" | "auto-locked" | null = !periodLocked
    ? null
    : isMonthOpen(year, month)
      ? "auto-locked"
      : "past-month";

  async function onSave() {
    if (!creatorId) {
      toast.error("Pick a creator from the roster.");
      return;
    }
    if (periodLocked) {
      toast.error(
        reason === "auto-locked"
          ? `${MONTH_NAMES[month - 1]} ${year} is auto-locked (>6 months old). Admin or finance needs to unlock it before saving.`
          : `${MONTH_NAMES[month - 1]} ${year} is closed. Past months can't be back-dated — pick the current month or later, or ask admin/finance to unlock the period.`,
      );
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a positive invoice amount.");
      return;
    }
    if (!dueDate) {
      toast.error("Due date is required.");
      return;
    }
    const body = {
      creator_id: creatorId,
      period_year: year,
      period_month: month,
      invoice_number: invoiceNumber.trim() || null,
      amount: num,
      due_date: dueDate,
      invoice_url: invoiceUrl.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (invoice) {
        await update.mutateAsync({ id: invoice.id, patch: body });
        toast.success("Invoice updated");
      } else {
        await add.mutateAsync(body);
        toast.success("Invoice added");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error).message;
      // Surface the unique constraint nicely
      if (msg.toLowerCase().includes("duplicate")) {
        toast.error(
          `An invoice already exists for ${MONTH_NAMES[month - 1]} ${year}. Edit that one instead.`,
        );
      } else {
        toast.error(`Save failed: ${msg}`);
      }
    }
  }

  async function markPaid() {
    if (!invoice) return;
    try {
      await setStatus.mutateAsync({
        id: invoice.id,
        status: "paid",
        amount_paid: Number(invoice.amount),
      });
      toast.success("Marked paid");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }

  async function reopen() {
    if (!invoice) return;
    try {
      await setStatus.mutateAsync({ id: invoice.id, status: "unpaid" });
      toast.success("Reopened");
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }

  async function onDelete() {
    if (!invoice) return;
    const ok = await confirm({
      title: "Delete this invoice?",
      description: `Removes the ${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year} invoice for this creator. Cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(invoice.id);
      toast.success("Invoice deleted");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  const creatorName = (creators ?? []).find((c) => c.id === creatorId)?.name ?? "";
  const yearOptions = Array.from(
    { length: 5 },
    (_, i) => today.getFullYear() - 2 + i,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            {invoice
              ? `Invoice — ${creatorName} · ${MONTH_NAMES[month - 1]} ${year}`
              : "New invoice"}
          </DialogTitle>
          <DialogDescription>
            One invoice per creator per month. The Calculator section computes
            the amount; this is where you record the invoice details and
            payment status.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {periodLocked ? (
            <div className="rounded-md border border-overdue/40 bg-overdue/10 px-3 py-2 text-[12px] text-overdue">
              <strong className="font-semibold">
                {reason === "auto-locked" ? "Auto-locked period." : "Closed month."}
              </strong>{" "}
              {reason === "auto-locked" ? (
                <>
                  {MONTH_NAMES[month - 1]} {year} is older than 6 months and
                  is locked for editing. Admin or finance can unlock it
                  from the month-header lock icon on the grid.
                </>
              ) : (
                <>
                  {MONTH_NAMES[month - 1]} {year} is in the past and can't
                  accept new invoices. Pick the current month or later, or
                  ask admin/finance to unlock the period.
                </>
              )}
            </div>
          ) : null}

          {/* Creator + period — locked when editing so we don't accidentally
              shift an invoice between creators or months. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 grid gap-1.5 sm:col-span-1">
              <Label>Creator *</Label>
              <Select
                value={creatorId}
                onValueChange={setCreatorId}
                disabled={!!invoice}
              >
                <SelectTrigger>
                  <SelectValue placeholder={creatorsLoading ? "Loading…" : "Pick creator"} />
                </SelectTrigger>
                <SelectContent>
                  {(creators ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Year *</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
                disabled={!!invoice}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Month *</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
                disabled={!!invoice}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ti-number">Invoice number</Label>
              <Input
                id="ti-number"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ti-amount">Amount (USD) *</Label>
              <Input
                id="ti-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ti-due">Due date *</Label>
              <DatePicker
                id="ti-due"
                value={dueDate}
                onChange={(v) => setDueDate(v ?? "")}
                allowClear={false}
              />
            </div>
          </div>

          {/* Invoice URL with Google-Sheets-style blue link preview */}
          <div className="grid gap-1.5">
            <Label htmlFor="ti-url">Invoice link</Label>
            <Input
              id="ti-url"
              type="url"
              value={invoiceUrl}
              onChange={(e) => setInvoiceUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
            />
            {invoiceUrl.trim() && (
              <a
                href={invoiceUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-xs text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
              >
                {invoiceUrl.trim()} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ti-notes">Notes</Label>
            <textarea
              id="ti-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Payment summary panel — only when editing */}
          {invoice && (
            <div className="rounded-md border bg-muted/15 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Status</span>
                <StatusPill status={invoice.status} />
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <SummaryStat label="Owed" value={formatUSD(Number(invoice.amount), { decimals: 2 })} />
                <SummaryStat label="Paid" value={formatUSD(Number(invoice.amount_paid), { decimals: 2 })} />
                <SummaryStat
                  label="Outstanding"
                  value={formatUSD(
                    Math.max(0, Number(invoice.amount) - Number(invoice.amount_paid)),
                    { decimals: 2 },
                  )}
                />
              </div>
              {invoice.paid_at && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Paid on {invoice.paid_at}
                  {invoice.payment_method ? ` · ${invoice.payment_method}` : ""}
                  {invoice.payment_reference ? ` · ref ${invoice.payment_reference}` : ""}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:flex-nowrap">
          {invoice && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={del.isPending}
              className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          )}
          {invoice && invoice.status !== "paid" && (
            <Button
              size="sm"
              variant="outline"
              onClick={markPaid}
              disabled={setStatus.isPending}
              className="text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
            >
              <Check className="mr-1 h-3 w-3" /> Mark paid
            </Button>
          )}
          {invoice && invoice.status === "paid" && (
            <Button
              size="sm"
              variant="outline"
              onClick={reopen}
              disabled={setStatus.isPending}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Reopen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting || periodLocked}>
            {submitting ? "Saving…" : invoice ? "Save changes" : "Add invoice"}
          </Button>
        </DialogFooter>
        {/* Suppress unused warning for the today vs todayISO discrepancy */}
        <span className="hidden">{todayISO}</span>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: TalentInvoice["status"] }) {
  const labels: Record<TalentInvoice["status"], string> = {
    unpaid: "Unpaid",
    partial: "Partial",
    paid: "Paid",
    overdue: "Overdue",
  };
  const styles: Record<TalentInvoice["status"], string> = {
    unpaid: "bg-muted text-muted-foreground",
    partial: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}
