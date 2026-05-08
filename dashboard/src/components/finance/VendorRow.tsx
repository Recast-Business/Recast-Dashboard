import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeleteVendor } from "@/hooks/useVendors";
import { useConfirm } from "@/hooks/useConfirm";
import { MonthlyPaymentGrid } from "@/components/finance/MonthlyPaymentGrid";
import type { Vendor, VendorPayment, PaymentMethod } from "@/types/finance";

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  auto_pay: "Auto Pay",
  paypal: "PayPal",
  domestic_wire: "Domestic Wire",
  international_transfer: "Int'l Transfer",
  bank_ach: "Bank ACH",
  zelle: "Zelle",
  invoice_link: "Invoice Link",
  website_link: "Website Link",
  credit_card: "Credit Card",
};

interface Props {
  vendor: Vendor;
  year: number;
  payments: Record<number, VendorPayment>;
  onEdit: () => void;
}

export function VendorRow({ vendor, year, payments, onEdit }: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const del = useDeleteVendor();
  const confirm = useConfirm();

  const paidCount = React.useMemo(
    () => Object.values(payments).filter((p) => p.status === "paid").length,
    [payments],
  );
  const overdueCount = React.useMemo(
    () => Object.values(payments).filter((p) => p.status === "overdue").length,
    [payments],
  );

  async function onDelete() {
    const ok = await confirm({
      title: `Delete ${vendor.name}?`,
      description: "This wipes all monthly payment history and the linked banking records. Cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(vendor.id);
      toast.success(`${vendor.name} deleted`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{vendor.name}</span>
            {!vendor.active && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {vendor.payment_method && <span>{PAYMENT_METHOD_LABEL[vendor.payment_method]}</span>}
            {vendor.account_profile && <span>· {vendor.account_profile}</span>}
            {vendor.contact_name && <span>· {vendor.contact_name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {paidCount > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-900">
              {paidCount} paid
            </span>
          )}
          {overdueCount > 0 && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-900">
              {overdueCount} overdue
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t p-3">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Monthly payments — {year}
            </div>
            <MonthlyPaymentGrid vendorId={vendor.id} year={year} payments={payments} />
            <div className="text-[11px] text-muted-foreground">
              Click a month to toggle paid · Shift-click or right-click for full edit (amount, date, invoice URL, notes)
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={del.isPending}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
