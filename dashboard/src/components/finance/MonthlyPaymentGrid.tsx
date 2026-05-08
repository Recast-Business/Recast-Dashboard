import * as React from "react";
import { toast } from "sonner";
import { useUpsertVendorPayment } from "@/hooks/useVendorPayments";
import { PaymentCellDialog } from "@/components/finance/PaymentCellDialog";
import type { VendorPayment, PaymentStatusV2 } from "@/types/finance";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/utils";

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
              title={`Click: toggle paid/unpaid · Shift-click or right-click: edit details`}
              className={cn(
                "flex flex-col items-stretch rounded-md border px-1.5 py-1 text-left transition hover:border-primary/50",
                STATUS_STYLES[status],
              )}
            >
              <div className="text-[10px] font-medium">{label}</div>
              <div className="truncate text-[11px]">
                {cell?.amount != null ? formatUSD(cell.amount, { decimals: 0 }) : "—"}
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
