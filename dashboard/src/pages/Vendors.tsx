import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { EyebrowLabel, InvoiceCell, MoneyCell } from "@/components/recast";
import { useDeleteVendor, useVendors } from "@/hooks/useVendors";
import { useVendorPaymentsByVendors } from "@/hooks/useVendorPayments";
import { PaymentCellDialog } from "@/components/finance/PaymentCellDialog";
import { VendorDialog } from "@/components/finance/VendorDialog";
import { useConfirm } from "@/hooks/useConfirm";
import type { PaymentStatusV2, Vendor, VendorPayment } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase L (C4a): Vendors index page.
 *
 * Sister to C2 (Talent Paying Us) and C3 (Talent We Pay) — same
 * canonical recipes, just different data filter. Rows = vendors
 * with kind='vendor' (companies we pay: Adobe, Restream, etc.).
 *
 * Key differences vs C3:
 *   • Sticky-left vendor name is a <Link> to /vendors/:id (the
 *     detail page) — that's where the recurring monthly grid +
 *     ad-hoc invoices + receipts list live in full
 *   • Cell-click still uses PaymentCellDialog for inline edits,
 *     so logging the monthly bill doesn't require leaving the index
 *
 * Spec §11 inheritance:
 *   • Sticky-left first column with bg #0d0d0d
 *   • Cell tints 5–7% alpha + 6×6 corner pip
 *   • Hairline border, no shadow
 *   • Reconciliation strip footer with 4th cell tinted Electric Blue 6%
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function VendorsPage() {
  const year = new Date().getFullYear();
  const { data: vendors, isLoading: vendorsLoading } = useVendors({ kind: "vendor" });

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatusV2 | "all">("all");
  const [vendorDialogOpen, setVendorDialogOpen] = React.useState(false);
  const [editingVendor, setEditingVendor] = React.useState<Vendor | null>(null);
  const [editingCell, setEditingCell] = React.useState<{
    vendorId: string;
    month: number;
    existing: VendorPayment | null;
  } | null>(null);

  const del = useDeleteVendor();
  const confirm = useConfirm();

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = vendors ?? [];
    if (q) {
      rows = rows.filter((v) =>
        [v.name, v.contact_name, v.contact_email, v.notes].some(
          (f) => f && f.toLowerCase().includes(q),
        ),
      );
    }
    return rows;
  }, [vendors, search]);

  const ids = React.useMemo(() => filtered.map((v) => v.id), [filtered]);
  const { data: paymentsByVendor, isLoading: paymentsLoading } = useVendorPaymentsByVendors(ids, year);

  const filteredByStatus = React.useMemo(() => {
    if (statusFilter === "all") return filtered;
    return filtered.filter((v) => {
      const cells = paymentsByVendor?.[v.id] ?? {};
      return Object.values(cells).some((p) => p.status === statusFilter);
    });
  }, [filtered, paymentsByVendor, statusFilter]);

  const now = new Date();
  const currentMonthIdx = year === now.getFullYear() ? now.getMonth() : null;

  const totals = React.useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let cellCount = 0;
    let paidCount = 0;
    for (const v of filteredByStatus) {
      const cells = paymentsByVendor?.[v.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const p = cells[m];
        if (!p) continue;
        cellCount++;
        totalBilled += Number(p.amount) || 0;
        if (p.status === "paid") {
          paidCount++;
          totalPaid += Number(p.amount) || 0;
        }
      }
    }
    return {
      totalBilled,
      totalPaid,
      cellCount,
      paidCount,
      outstanding: Math.max(0, totalBilled - totalPaid),
      pctPaid: cellCount > 0 ? Math.round((paidCount / cellCount) * 100) : 0,
    };
  }, [filteredByStatus, paymentsByVendor]);

  const csvRows = React.useMemo(() => {
    const rows: { vendor: string; month: string; amount: number; status: string }[] = [];
    for (const v of filteredByStatus) {
      const cells = paymentsByVendor?.[v.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const p = cells[m];
        if (!p) continue;
        rows.push({
          vendor: v.name,
          month: `${MONTHS[m - 1]} ${year}`,
          amount: Number(p.amount) || 0,
          status: p.status,
        });
      }
    }
    return rows;
  }, [filteredByStatus, paymentsByVendor, year]);

  function openAddVendor() {
    setEditingVendor(null);
    setVendorDialogOpen(true);
  }
  function openEditVendor(v: Vendor) {
    setEditingVendor(v);
    setVendorDialogOpen(true);
  }
  async function onDeleteVendor(v: Vendor) {
    const ok = await confirm({
      title: `Delete ${v.name}?`,
      description:
        "Permanently removes this vendor and every logged monthly payment, ad-hoc invoice, and receipt. Cannot be undone.",
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

  const isLoading = vendorsLoading || paymentsLoading;

  return (
    <div className="space-y-6">
      {/* Top eyebrow strip */}
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        Ledgers · Counterparties
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EyebrowLabel withRule>Vendors · {year}</EyebrowLabel>
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            Vendors
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
            Companies and services Recast pays. Click any vendor name to
            open their full profile — recurring monthly grid, ad-hoc
            invoices, receipts, and contract metadata. Click a cell to
            log or edit the monthly bill inline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCSVButton
            filename={`recast-vendors-${year}.csv`}
            rows={csvRows}
            label="Export CSV"
            disabled={csvRows.length === 0}
            columns={[
              { header: "Vendor", value: (r) => r.vendor },
              { header: "Month",  value: (r) => r.month },
              { header: "Amount", value: (r) => r.amount.toFixed(2) },
              { header: "Status", value: (r) => r.status },
            ]}
          />
          <Button onClick={openAddVendor} size="sm" className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> Add vendor
          </Button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" strokeWidth={1.5} />
          <Input
            placeholder="Search vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[240px] rounded-md bg-card pl-8 text-[13px] placeholder:text-steel"
          />
        </div>
        <StatusFilterChips value={statusFilter} onChange={setStatusFilter} />
        <span className="ml-auto text-[12px] text-steel">
          {filteredByStatus.length} {filteredByStatus.length === 1 ? "vendor" : "vendors"} · {totals.cellCount} payment{totals.cellCount === 1 ? "" : "s"} YTD
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-lg" />
      ) : filteredByStatus.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          {vendors?.length
            ? "No vendors match the current filter."
            : "No vendors yet — click Add vendor to onboard your first counterparty."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-[220px] bg-[#0d0d0d] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel"
                  >
                    Vendor
                  </th>
                  {MONTHS.map((label, i) => {
                    const isCurrent = currentMonthIdx === i;
                    const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                    return (
                      <th
                        key={label}
                        scope="col"
                        className={cn(
                          "min-w-[88px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.13em]",
                          isCurrent ? "text-white" : isFuture ? "text-steel/40" : "text-steel",
                        )}
                      >
                        {label}
                        {isCurrent ? <span className="ml-1 text-electric">·</span> : null}
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="min-w-[110px] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.13em] text-steel"
                  >
                    YTD
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredByStatus.map((v) => {
                  const cells = paymentsByVendor?.[v.id] ?? {};
                  let total = 0;
                  let cellTotal = 0;
                  for (let m = 1; m <= 12; m++) {
                    const p = cells[m];
                    if (p) {
                      total += Number(p.amount) || 0;
                      cellTotal++;
                    }
                  }
                  return (
                    <tr
                      key={v.id}
                      className="group border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    >
                      {/* Sticky-left vendor column. Name is a Link to
                          the detail page — opens full profile. Edit +
                          Delete are always-visible quiet icons. */}
                      <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to={`/vendors/${v.id}`}
                            className="group/link min-w-0 flex-1 text-left transition-colors duration-base ease-out hover:text-electric"
                          >
                            <div className="flex items-center gap-1 truncate text-[13px] font-medium text-white group-hover/link:text-electric">
                              {v.name}
                              <ChevronRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" strokeWidth={1.5} />
                            </div>
                            <div className="text-[11px] text-steel">
                              {v.payment_method
                                ? PAYMENT_METHOD_SHORT[v.payment_method] ?? v.payment_method
                                : "Unspecified"}
                              {v.division ? ` · ${DIVISION_LABEL[v.division] ?? v.division}` : ""}
                            </div>
                          </Link>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => openEditVendor(v)}
                              title="Edit vendor"
                              aria-label={`Edit ${v.name}`}
                              className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteVendor(v)}
                              title="Delete vendor"
                              aria-label={`Delete ${v.name}`}
                              disabled={del.isPending}
                              className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-overdue/40 hover:bg-overdue/10 hover:text-overdue disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      </td>

                      {MONTHS.map((_label, i) => {
                        const month = i + 1;
                        const p = cells[month];
                        const isFuture =
                          currentMonthIdx !== null && i > currentMonthIdx;
                        return (
                          <td key={month} className="p-1 align-middle">
                            {p && p.amount != null ? (
                              <InvoiceCell
                                amount={Number(p.amount) || 0}
                                ref_={p.invoice_url ? "↗ link" : "—"}
                                status={p.status}
                                future={isFuture}
                                onClick={() => setEditingCell({ vendorId: v.id, month, existing: p })}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingCell({ vendorId: v.id, month, existing: p ?? null })}
                                className={cn(
                                  "block h-full w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                                  isFuture && "opacity-50",
                                )}
                                title={`Log ${MONTHS[month - 1]} ${year} payment for ${v.name}`}
                              >
                                +
                              </button>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-right">
                        {total > 0 ? (
                          <div className="flex flex-col items-end leading-tight">
                            <MoneyCell amount={total} size="body" splitDecimals={false} />
                            <span className="text-[10px] text-steel">
                              {cellTotal} {cellTotal === 1 ? "payment" : "payments"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-steel">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reconciliation strip */}
      {!isLoading && filteredByStatus.length > 0 ? <ReconciliationStrip totals={totals} /> : null}

      {editingCell ? (
        <PaymentCellDialog
          open
          onOpenChange={(o) => !o && setEditingCell(null)}
          vendorId={editingCell.vendorId}
          year={year}
          month={editingCell.month}
          existing={editingCell.existing}
        />
      ) : null}

      <VendorDialog
        open={vendorDialogOpen}
        onOpenChange={(o) => {
          setVendorDialogOpen(o);
          if (!o) setEditingVendor(null);
        }}
        defaultKind="vendor"
        vendor={editingVendor}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_SHORT: Record<string, string> = {
  auto_pay: "Auto pay",
  paypal: "PayPal",
  domestic_wire: "Wire",
  international_transfer: "Intl wire",
  bank_ach: "ACH",
  zelle: "Zelle",
  invoice_link: "Invoice link",
  website_link: "Website",
  credit_card: "Card",
};

const DIVISION_LABEL: Record<string, string> = {
  onlyfans: "OnlyFans",
  telegram: "Telegram",
  efuse: "Overlay",
};

function StatusFilterChips({
  value,
  onChange,
}: {
  value: PaymentStatusV2 | "all";
  onChange: (v: PaymentStatusV2 | "all") => void;
}) {
  const options: { v: PaymentStatusV2 | "all"; label: string; tone?: "paid" | "partial" | "overdue" }[] = [
    { v: "all", label: "All" },
    { v: "paid", label: "Paid", tone: "paid" },
    { v: "partial", label: "Partial", tone: "partial" },
    { v: "overdue", label: "Overdue", tone: "overdue" },
    { v: "unpaid", label: "Unpaid" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border bg-card p-0.5">
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
              active ? "bg-white/[0.06] text-white" : "text-steel hover:text-white",
            )}
          >
            {o.tone && active ? (
              <span
                className={cn(
                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                  o.tone === "paid" && "bg-paid",
                  o.tone === "partial" && "bg-partial",
                  o.tone === "overdue" && "bg-overdue",
                )}
              />
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ReconciliationStrip({
  totals,
}: {
  totals: {
    totalBilled: number;
    totalPaid: number;
    cellCount: number;
    paidCount: number;
    outstanding: number;
    pctPaid: number;
  };
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
      <ReconciliationCell
        label="Payments cleared"
        value={`${totals.paidCount}/${totals.cellCount}`}
        sub={`${totals.pctPaid}% of logged`}
      />
      <ReconciliationCell
        label="Total billed"
        value={formatUSD(totals.totalBilled, { decimals: 0 })}
        sub="YTD obligations"
      />
      <ReconciliationCell
        label="Total paid out"
        value={formatUSD(totals.totalPaid, { decimals: 0 })}
        sub="Cleared receipts"
      />
      <ReconciliationCell
        label="Outstanding"
        value={formatUSD(totals.outstanding, { decimals: 0 })}
        sub="Unpaid + partial + overdue"
        emphasised
        tone="electric"
      />
    </div>
  );
}

function ReconciliationCell({
  label,
  value,
  sub,
  emphasised,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  emphasised?: boolean;
  tone?: "electric";
}) {
  return (
    <div
      className={cn(
        "border-rule px-tile-md py-3 not-last:border-r",
        tone === "electric" && "bg-[rgba(37,99,235,0.06)]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">{label}</div>
      <div
        className={cn(
          "tabular mt-2 font-display font-extrabold leading-none tracking-[-0.022em] text-white",
          emphasised ? "text-[30px]" : "text-[22px]",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-steel">{sub}</div>
    </div>
  );
}
