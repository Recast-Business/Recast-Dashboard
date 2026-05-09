import * as React from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteVendorInvoice,
  useSetInvoiceStatus,
  useVendorInvoices,
} from "@/hooks/useVendorInvoices";
import { useConfirm } from "@/hooks/useConfirm";
import { VendorInvoiceDialog } from "@/components/finance/VendorInvoiceDialog";
import type { PaymentStatusV2, VendorInvoice } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase K-4: Ad-hoc invoices panel under each VendorRow.
 *
 * Renders inside the expanded vendor card, beneath the recurring monthly
 * grid. Shows every invoice for the vendor with status, due date, and
 * inline actions (Mark paid · Reopen · Edit · Delete).
 */

interface Props {
  vendorId: string;
  vendorName: string;
}

const STATUS_BADGE: Record<PaymentStatusV2, { label: string; className: string }> = {
  unpaid: {
    label: "Unpaid",
    className: "bg-muted text-muted-foreground",
  },
  partial: {
    label: "Partial",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  overdue: {
    label: "Overdue",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
};

export function VendorInvoicesPanel({ vendorId, vendorName }: Props) {
  const { data, isLoading } = useVendorInvoices(vendorId);
  const setStatus = useSetInvoiceStatus();
  const del = useDeleteVendorInvoice();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VendorInvoice | null>(null);

  const invoices = data ?? [];
  const totals = React.useMemo(() => {
    let owed = 0;
    let paid = 0;
    let overdueCount = 0;
    for (const i of invoices) {
      if (i.status === "paid") {
        paid += Number(i.amount) || 0;
      } else {
        owed += Number(i.amount) || 0;
        if (i.status === "overdue") overdueCount++;
      }
    }
    return { owed, paid, overdueCount };
  }, [invoices]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(inv: VendorInvoice) {
    setEditing(inv);
    setDialogOpen(true);
  }

  async function markPaid(inv: VendorInvoice) {
    try {
      await setStatus.mutateAsync({
        id: inv.id,
        vendor_id: vendorId,
        status: "paid",
      });
      toast.success("Marked paid");
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }
  async function reopen(inv: VendorInvoice) {
    try {
      await setStatus.mutateAsync({
        id: inv.id,
        vendor_id: vendorId,
        status: "unpaid",
      });
      toast.success("Reopened");
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }
  async function onDelete(inv: VendorInvoice) {
    const ok = await confirm({
      title: "Delete this invoice?",
      description: `Removes "${inv.description}" — cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync({ id: inv.id, vendor_id: vendorId });
      toast.success("Invoice deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Ad-hoc invoices
          </div>
          <div className="text-[11px] text-muted-foreground">
            {invoices.length === 0
              ? "One-off bills with custom due dates — separate from the monthly grid above."
              : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · ${formatUSD(totals.owed, { decimals: 2 })} owed${totals.overdueCount > 0 ? ` · ${totals.overdueCount} overdue` : ""}`}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={openAdd}>
          <Plus className="mr-1 h-3 w-3" /> New invoice
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : invoices.length === 0 ? null : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Issued</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => {
                const badge = STATUS_BADGE[inv.status];
                return (
                  <tr
                    key={inv.id}
                    className={cn(
                      "border-t hover:bg-muted/30",
                      i % 2 === 1 && "bg-muted/15",
                    )}
                  >
                    <td className="max-w-[260px] truncate px-3 py-2 font-medium text-foreground" title={inv.description}>
                      {inv.description}
                      {inv.invoice_url && (
                        <a
                          href={inv.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground"
                          title="Open invoice URL"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{inv.issued_at}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{inv.due_date}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatUSD(Number(inv.amount), { decimals: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {inv.status === "paid" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => reopen(inv)}
                          disabled={setStatus.isPending}
                          title="Reopen — set back to unpaid"
                        >
                          <RotateCcw className="mr-1 h-3 w-3" /> Reopen
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                          onClick={() => markPaid(inv)}
                          disabled={setStatus.isPending}
                          title="Mark paid"
                        >
                          <Check className="mr-1 h-3 w-3" /> Mark paid
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1 h-7 w-7 p-0"
                        onClick={() => openEdit(inv)}
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete(inv)}
                        disabled={del.isPending}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && (
        <VendorInvoiceDialog
          open
          onOpenChange={setDialogOpen}
          vendorId={vendorId}
          vendorName={vendorName}
          invoice={editing}
        />
      )}
    </div>
  );
}
