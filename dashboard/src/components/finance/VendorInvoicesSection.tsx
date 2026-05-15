import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllVendorInvoices } from "@/hooks/useVendorInvoices";
import { useVendors } from "@/hooks/useVendors";
import { EyebrowLabel, MoneyCell, StatusPill } from "@/components/recast";
import { VendorInvoiceDialog } from "@/components/finance/VendorInvoiceDialog";
import { useViewCampaignFinancials } from "@/auth/useRole";
import { useAuth } from "@/auth/AuthProvider";
import { formatDate, formatUSD } from "@/lib/utils";
import type { PaymentStatusV2, VendorInvoice } from "@/types/finance";

/**
 * Bruno separation: vendor invoices live on /finance (not on the
 * vendor detail page). Cross-vendor list, filter by vendor + status,
 * add new from a vendor picker. Reuses VendorInvoiceDialog for the
 * actual create/edit flow.
 */

interface Props {
  year: number;
}

const STATUS_FILTER: { value: PaymentStatusV2 | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export function VendorInvoicesSection({ year }: Props) {
  const { role } = useAuth();
  const seeFinancials = useViewCampaignFinancials();
  const canWrite = role === "admin" || role === "accounting";

  const { data: invoices, isLoading } = useAllVendorInvoices(year);
  const { data: vendors } = useVendors({});

  const [vendorFilter, setVendorFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatusV2 | "all">("all");
  const [search, setSearch] = React.useState("");
  const [creatingForVendor, setCreatingForVendor] = React.useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = React.useState<VendorInvoice | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter((inv) => {
      if (vendorFilter !== "all" && inv.vendor_id !== vendorFilter) return false;
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (q) {
        const hay = `${inv.description ?? ""} ${inv.vendor?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, vendorFilter, statusFilter, search]);

  const totals = React.useMemo(() => {
    let billed = 0;
    let outstanding = 0;
    for (const inv of filtered) {
      billed += Number(inv.amount) || 0;
      if (inv.status !== "paid") {
        outstanding += Number(inv.amount) || 0;
      }
    }
    return { billed, outstanding };
  }, [filtered]);

  // Picking "Add invoice" without a vendor pre-selection drops the
  // operator into a tiny vendor picker first. If filterByVendor is
  // already on, we skip straight to the dialog with that vendor.
  const [pickingVendor, setPickingVendor] = React.useState(false);
  function startAdd() {
    if (vendorFilter !== "all") {
      setCreatingForVendor(vendorFilter);
    } else {
      setPickingVendor(true);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-tile-md py-3.5">
        <div>
          <EyebrowLabel withRule>Vendor invoices · {year}</EyebrowLabel>
          <p className="mt-1.5 text-[13px] text-steel">
            One-off bills outside the vendor recurring grid. Pulls from
            every vendor — filter by vendor or status below.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={startAdd} size="sm" className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Add invoice
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-tile-md py-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" strokeWidth={1.5} />
          <Input
            placeholder="Search description or vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="h-8 w-[180px] text-[13px]">
            <SelectValue placeholder="All vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {(vendors ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PaymentStatusV2 | "all")}>
          <SelectTrigger className="h-8 w-[140px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {seeFinancials ? (
          <div className="ml-auto flex items-center gap-3 text-[11px] text-steel">
            <span>
              Billed{" "}
              <span className="tabular font-semibold text-white">
                {formatUSD(totals.billed, { decimals: 2 })}
              </span>
            </span>
            <span className="text-rule">·</span>
            <span>
              Outstanding{" "}
              <span className="tabular text-partial">
                {formatUSD(totals.outstanding, { decimals: 2 })}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="px-tile-md py-6">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-tile-md py-12 text-center text-[12.5px] text-steel">
          {(invoices?.length ?? 0) === 0
            ? "No vendor invoices logged yet. Click Add invoice to create one."
            : "No invoices match the current filters."}
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rule">
              <th className="px-tile-md py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                Vendor
              </th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                Description
              </th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                Issued
              </th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                Due
              </th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                Amount
              </th>
              <th className="px-tile-md py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr
                key={inv.id}
                onClick={() => canWrite && setEditingInvoice(inv)}
                className={
                  canWrite
                    ? "cursor-pointer border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    : "border-b border-rule"
                }
              >
                <td className="px-tile-md py-2.5 text-[13px] font-medium text-white">
                  {inv.vendor?.name ?? "—"}
                </td>
                <td className="px-2 py-2.5 text-[12.5px] text-steel">
                  {inv.description}
                </td>
                <td className="px-2 py-2.5 text-[12px] text-steel">
                  {formatDate(inv.issued_at)}
                </td>
                <td className="px-2 py-2.5 text-[12px] text-steel">
                  {formatDate(inv.due_date)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <MoneyCell amount={Number(inv.amount) || 0} size="body" splitDecimals={false} />
                </td>
                <td className="px-tile-md py-2.5">
                  <StatusPill status={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Vendor picker for the add flow — only used when no vendor
          filter is active. With a filter, we skip straight to the
          invoice dialog with that vendor preset. */}
      {pickingVendor ? (
        <VendorPickerDialog
          vendors={vendors ?? []}
          onPick={(vendorId) => {
            setPickingVendor(false);
            setCreatingForVendor(vendorId);
          }}
          onCancel={() => setPickingVendor(false)}
        />
      ) : null}

      {creatingForVendor ? (
        <VendorInvoiceDialog
          open
          onOpenChange={(o) => !o && setCreatingForVendor(null)}
          vendorId={creatingForVendor}
          vendorName={
            (vendors ?? []).find((v) => v.id === creatingForVendor)?.name ?? ""
          }
          invoice={null}
        />
      ) : null}

      {editingInvoice ? (
        <VendorInvoiceDialog
          open
          onOpenChange={(o) => !o && setEditingInvoice(null)}
          vendorId={editingInvoice.vendor_id}
          vendorName={
            (invoices ?? []).find((i) => i.id === editingInvoice.id)?.vendor?.name ?? ""
          }
          invoice={editingInvoice}
        />
      ) : null}
    </Card>
  );
}

/* Small inline vendor picker used by the Add flow when no vendor
 * filter is active. Avoids creating a full new component file —
 * just a Dialog wrapping a list. */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Vendor } from "@/types/finance";

function VendorPickerDialog({
  vendors,
  onPick,
  onCancel,
}: {
  vendors: Vendor[];
  onPick: (vendorId: string) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, search]);
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Pick a vendor</DialogTitle>
          <DialogDescription className="text-[12px]">
            Choose which vendor this invoice is for. The next step opens
            the full invoice form.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pt-3">
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-[13px]"
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-6 py-3">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/40 p-6 text-center text-[12.5px] text-steel">
              No matches.
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {filtered.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onPick(v.id)}
                    className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left transition-colors duration-base ease-out hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-white">
                        {v.name}
                      </div>
                      <div className="truncate text-[11px] text-steel">{v.kind}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
