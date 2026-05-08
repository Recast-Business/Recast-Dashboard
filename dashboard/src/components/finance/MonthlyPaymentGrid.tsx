import * as React from "react";
import { toast } from "sonner";
import { useUpsertVendorPayment } from "@/hooks/useVendorPayments";
import { PaymentCellDialog } from "@/components/finance/PaymentCellDialog";
import type { VendorPayment, PaymentStatusV2 } from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface Props {
  vendorId: string;
  year: number;
  payments: Record<number, VendorPayment>;
}

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/40 text-muted-foreground",
  partial: "bg-amber-50 text-amber-900 border-amber-200",
  paid: "bg-emerald-50 text-emerald-900 border-emerald-200",
  overdue: "bg-rose-50 text-rose-900 border-rose-200",
};

export function MonthlyPaymentGrid({ vendorId, year, payments }: Props) {
  const [openMonth, setOpenMonth] = React.useState<number | null>(null);
  const upsert = useUpsertVendorPayment();

  async function quickToggle(month: number, current?: VendorPayment) {
    // Click without holding modifier: cycle status unpaid -> paid -> unpaid (the common case).
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

  return (
    <>
      <div className="grid grid-cols-12 gap-1 text-xs">
        {MONTHS.map((label, i) => {
          const month = i + 1;
          const cell = payments[month];
          const status = cell?.status ?? "unpaid";
          return (
            <button
              key={month}
              type="button"
              onClick={(e) => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  setOpenMonth(month);
                } else {
                  quickToggle(month, cell);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpenMonth(month);
              }}
              title={
                cell?.amount != null
                  ? `${formatUSD(cell.amount, { decimals: 2 })} · click to toggle, right-click to edit`
                  : "Click: toggle paid · Right-click: edit details"
              }
              className={cn(
                "flex flex-col items-stretch gap-1 rounded-md border px-2 py-2 text-left transition hover:border-primary/50",
                STATUS_STYLES[status],
              )}
            >
              <div className="text-[11px] font-medium uppercase tracking-wider">{label}</div>
              <div className="text-sm font-semibold tabular-nums">
                {cell?.amount != null ? formatUSDCompact(Number(cell.amount)) : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {openMonth != null && (
        <PaymentCellDialog
          open={openMonth != null}
          onOpenChange={(o) => !o && setOpenMonth(null)}
          vendorId={vendorId}
          year={year}
          month={openMonth}
          existing={payments[openMonth] ?? null}
        />
      )}
    </>
  );
}
