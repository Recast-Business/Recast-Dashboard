import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { MoneyCell, StatusPill } from "@/components/recast";
import { useDeleteTalentInvoice } from "@/hooks/useTalentInvoices";
import { useConfirm } from "@/hooks/useConfirm";
import { effectiveInvoiceStatus } from "@/lib/finance/invoiceStatus";
import { cn, formatDate, formatUSD } from "@/lib/utils";
import type { TalentInvoice } from "@/types/finance";

/**
 * R5 follow-up (Gus) — per-month invoice list dialog.
 *
 * Phase M-6 enforced one invoice per (creator, month). Migration
 * 0047 dropped that constraint. This dialog manages the now-possible
 * multi-invoice case for a single (creator, year, month) cell:
 *
 *   • Lists every existing invoice for the cell, newest due-date
 *     first.
 *   • Per-row Edit (pencil) opens the existing TalentInvoiceDialog
 *     in edit mode — caller wires that up via onEdit().
 *   • Per-row Delete (trash) deletes after a confirm dialog. Cascade
 *     handled by useDeleteTalentInvoice.
 *   • "+ Add another invoice" button at the bottom calls onCreate()
 *     to open the TalentInvoiceDialog in create mode pre-scoped to
 *     this (creator, month).
 *
 * Status pills use effectiveInvoiceStatus so an overdue invoice
 * still reads red even if the stored status hasn't been flipped.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorId: string;
  creatorName: string;
  year: number;
  month: number; // 1-indexed
  invoices: TalentInvoice[];
  /** Called when the user clicks the per-row pencil. The caller
   *  opens TalentInvoiceDialog in edit mode against this invoice. */
  onEdit: (invoice: TalentInvoice) => void;
  /** Called when the user clicks "+ Add another invoice". The
   *  caller opens TalentInvoiceDialog in create mode for the same
   *  (creator, year, month). */
  onCreate: () => void;
}

export function TalentMonthInvoicesDialog({
  open,
  onOpenChange,
  creatorId: _creatorId,
  creatorName,
  year,
  month,
  invoices,
  onEdit,
  onCreate,
}: Props) {
  const del = useDeleteTalentInvoice();
  const confirm = useConfirm();
  void _creatorId; // currently unused — reserved for future filtering

  // Total for the header strip — convenient quick-sum across the
  // multi-invoice month.
  const total = invoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);
  const paid = invoices.reduce(
    (s, inv) => s + (Number(inv.amount_paid) || 0),
    0,
  );

  async function onDelete(inv: TalentInvoice) {
    const ok = await confirm({
      title: `Delete this invoice?`,
      description: (
        <>
          {formatUSD(Number(inv.amount) || 0, { decimals: 2 })} for{" "}
          <strong>{creatorName}</strong>, {MONTHS[month - 1]} {year}.
          {inv.amount_paid > 0
            ? " Any payment receipts allocated to this invoice will need to be re-allocated manually."
            : ""}{" "}
          Cannot be undone.
        </>
      ),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(inv.id);
      toast.success("Invoice deleted");
      // If the last invoice for this month was deleted, the parent
      // grid will collapse the cell back to its "+" empty state on
      // the next render — the dialog stays open so the user can
      // confirm via the empty list.
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {creatorName} · {MONTHS[month - 1]} {year}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} on
            file for this month. Click an invoice to edit, or add another
            below.
          </DialogDescription>
        </DialogHeader>

        {/* Totals strip — quick reconciliation for the month. */}
        {invoices.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-[12px] text-steel">
            <span>
              Billed{" "}
              <span className="tabular font-semibold text-white">
                {formatUSD(total, { decimals: 2 })}
              </span>
            </span>
            <span className="text-rule">·</span>
            <span>
              Paid{" "}
              <span className="tabular text-paid">
                {formatUSD(paid, { decimals: 2 })}
              </span>
            </span>
            <span className="text-rule">·</span>
            <span>
              Outstanding{" "}
              <span
                className={cn(
                  "tabular",
                  total - paid > 0 ? "text-partial" : "text-paid",
                )}
              >
                {formatUSD(Math.max(0, total - paid), { decimals: 2 })}
              </span>
            </span>
          </div>
        ) : null}

        {/* Invoice list. Newest due_date first via the query order. */}
        <div className="max-h-[55vh] overflow-y-auto">
          {invoices.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/40 px-4 py-6 text-center text-[12.5px] text-steel">
              No invoices yet for this month. Click &quot;Add another
              invoice&quot; to create one.
            </div>
          ) : (
            <ul className="divide-y divide-rule rounded-md border bg-card">
              {invoices.map((inv) => {
                const effStatus = effectiveInvoiceStatus(inv);
                return (
                  <li
                    key={inv.id}
                    className="group flex items-center gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <MoneyCell
                          amount={Number(inv.amount) || 0}
                          size="body"
                          splitDecimals={false}
                        />
                        <StatusPill status={effStatus} />
                      </div>
                      <div className="mt-0.5 text-[11px] text-steel">
                        {inv.invoice_number ? (
                          <>
                            <span className="tabular">{inv.invoice_number}</span>
                            <span className="mx-1.5 text-rule">·</span>
                          </>
                        ) : null}
                        Due {formatDate(inv.due_date)}
                        {inv.amount_paid > 0 ? (
                          <>
                            <span className="mx-1.5 text-rule">·</span>
                            Paid {formatUSD(Number(inv.amount_paid), { decimals: 2 })}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-base ease-out group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEdit(inv)}
                        title="Edit invoice"
                        aria-label="Edit invoice"
                        className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(inv)}
                        disabled={del.isPending}
                        title="Delete invoice"
                        aria-label="Delete invoice"
                        className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-overdue/40 hover:bg-overdue/10 hover:text-overdue disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
            Add another invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
