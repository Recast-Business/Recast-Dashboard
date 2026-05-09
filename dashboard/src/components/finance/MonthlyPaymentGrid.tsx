import * as React from "react";
import { Link as LinkIcon } from "lucide-react";
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
  partial:
    "bg-gradient-to-r from-emerald-100 from-50% to-rose-100 to-50% text-foreground border-amber-200",
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
            <div key={month} className="relative">
              <button
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
                  "flex w-full flex-col items-stretch gap-1 rounded-md border px-2 py-2 text-left transition hover:border-primary/50",
                  STATUS_STYLES[status],
                )}
              >
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                  <span>{label}</span>
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  {cell?.amount != null ? formatUSDCompact(Number(cell.amount)) : "—"}
                </div>
              </button>
              {cell?.invoice_url && (
                <a
                  href={cell.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open invoice"
                  aria-label="Open invoice"
                  className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded bg-background/80 text-foreground/70 hover:text-primary hover:bg-background"
                >
                  <LinkIcon className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
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
