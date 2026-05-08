import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteVendor } from "@/hooks/useVendors";
import { useUpsertVendorPayment } from "@/hooks/useVendorPayments";
import { useConfirm } from "@/hooks/useConfirm";
import { PaymentCellDialog } from "@/components/finance/PaymentCellDialog";
import type {
  PaymentMethod,
  PaymentStatusV2,
  Vendor,
  VendorPayment,
} from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/30 text-muted-foreground",
  partial: "bg-amber-50 text-amber-900",
  paid: "bg-emerald-50 text-emerald-900",
  overdue: "bg-rose-50 text-rose-900",
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  auto_pay: "Auto Pay",
  paypal: "PayPal",
  domestic_wire: "Dom. Wire",
  international_transfer: "Int'l Wire",
  bank_ach: "Bank ACH",
  zelle: "Zelle",
  invoice_link: "Invoice",
  website_link: "Website",
  credit_card: "Card",
};

interface Props {
  vendors: Vendor[];
  paymentsByVendor: Record<string, Record<number, VendorPayment>>;
  year: number;
  onEdit: (v: Vendor) => void;
}

interface CellTarget {
  vendorId: string;
  month: number;
}

/**
 * Spreadsheet-style wide layout: vendor metadata + 12-month grid in one row.
 * Sensitive bank/card numbers are intentionally NOT collected — only the
 * friendly account_profile label (e.g. "Chase business credit card") and the
 * monthly amount.
 */
export function VendorTable({ vendors, paymentsByVendor, year, onEdit }: Props) {
  const upsert = useUpsertVendorPayment();
  const del = useDeleteVendor();
  const confirm = useConfirm();
  const [editingCell, setEditingCell] = React.useState<CellTarget | null>(null);

  async function quickToggle(vendorId: string, month: number, current?: VendorPayment) {
    const nextStatus: PaymentStatusV2 =
      !current || current.status === "unpaid" ? "paid" : "unpaid";
    try {
      await upsert.mutateAsync({
        vendor_id: vendorId,
        period_year: year,
        period_month: month,
        status: nextStatus,
        amount: current?.amount ?? null,
        paid_at: nextStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
        invoice_url: current?.invoice_url ?? null,
        notes: current?.notes ?? null,
      });
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }

  async function onDelete(v: Vendor) {
    const ok = await confirm({
      title: `Delete ${v.name}?`,
      description: "This wipes all monthly payment history and the linked banking records.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(v.id);
      toast.success(`${v.name} deleted`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
              <TableHead className="sticky left-0 z-10 min-w-[200px] bg-muted/40">Name</TableHead>
              <TableHead className="min-w-[110px]">Method</TableHead>
              <TableHead className="min-w-[150px]">Profile</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="min-w-[64px] text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead className="min-w-[70px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((v) => {
              const cells = paymentsByVendor[v.id] ?? {};
              return (
                <TableRow key={v.id} className="text-xs">
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    {v.name}
                  </TableCell>
                  <TableCell>{v.payment_method ? PAYMENT_METHOD_LABEL[v.payment_method] : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.account_profile || "—"}</TableCell>
                  {MONTHS.map((_label, i) => {
                    const month = i + 1;
                    const cell = cells[month];
                    const status = cell?.status ?? "unpaid";
                    return (
                      <TableCell key={month} className="p-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (e.shiftKey || e.metaKey || e.ctrlKey) {
                              setEditingCell({ vendorId: v.id, month });
                            } else {
                              quickToggle(v.id, month, cell);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setEditingCell({ vendorId: v.id, month });
                          }}
                          title={
                            cell?.amount != null
                              ? `${formatUSD(cell.amount, { decimals: 2 })} · click to toggle, right-click to edit`
                              : "Click: toggle paid · Right-click: edit details"
                          }
                          className={cn(
                            "block w-full rounded px-1 py-1.5 text-center font-semibold tabular-nums transition hover:ring-2 hover:ring-primary/40",
                            STATUS_STYLES[status],
                          )}
                        >
                          {cell?.amount != null ? formatUSDCompact(Number(cell.amount)) : "—"}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => onEdit(v)}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => onDelete(v)}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Click any month to toggle paid · Shift-click or right-click for full edit (amount, date, invoice URL, notes).
      </div>

      {editingCell && (
        <PaymentCellDialog
          open={!!editingCell}
          onOpenChange={(o) => !o && setEditingCell(null)}
          vendorId={editingCell.vendorId}
          year={year}
          month={editingCell.month}
          existing={paymentsByVendor[editingCell.vendorId]?.[editingCell.month] ?? null}
        />
      )}
    </>
  );
}
