import * as React from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { EyebrowLabel, InvoiceCell, MoneyCell } from "@/components/recast";
import { useVendors, useDeleteVendor } from "@/hooks/useVendors";
import { useVendorPaymentsByVendors } from "@/hooks/useVendorPayments";
import { PaymentCellDialog } from "@/components/finance/PaymentCellDialog";
import { VendorDialog } from "@/components/finance/VendorDialog";
import { useConfirm } from "@/hooks/useConfirm";
import type { PaymentStatusV2, Vendor, VendorPayment } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";
import { useLockState } from "@/hooks/useLockState";
import { MonthLockBadge } from "@/components/finance/MonthLockBadge";

/**
 * Phase L (C3): Talent We Pay — sister grid to C2 (Talent Paying Us).
 *
 * Same canonical recipes as TalentInvoiceGrid:
 *   • Cell-IS-the-invoice with <InvoiceCell> (status border-l +
 *     6×6 corner pip + 5–7% tint)
 *   • Sticky-left first column with bg #0d0d0d
 *   • Current-month header bold + white, future months at 40% opacity
 *   • Reconciliation strip footer with the 4th cell tinted Electric
 *     Blue 6% at 30px display weight
 *   • Eyebrow with 24px Electric Blue rule prefix
 *
 * Data shape difference vs C2:
 *   • Rows = vendors WHERE kind='talent_we_pay' (one-off contractors,
 *     non-creator humans we pay flat amounts)
 *   • Cells = vendor_payments rows for the year, indexed by vendor_id
 *     × month
 *   • Cell click → PaymentCellDialog (existing vendor-payment editor),
 *     not the talent_invoices dialog used in C2
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  year: number;
}

export function TalentWePayGrid({ year }: Props) {
  const { data: vendors, isLoading: vendorsLoading } = useVendors({ kind: "talent_we_pay" });

  const lock = useLockState();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatusV2 | "all">("all");
  // VendorDialog state — handles BOTH create (vendor=null) and edit
  // (vendor=Vendor). Toggle via openAddVendor / openEditVendor below.
  const [vendorDialogOpen, setVendorDialogOpen] = React.useState(false);
  const [editingVendor, setEditingVendor] = React.useState<Vendor | null>(null);
  const [editingCell, setEditingCell] = React.useState<{
    vendorId: string;
    month: number;
    existing: VendorPayment | null;
    /** Round 4: pre-fill amount when opened from a recurring-vendor
     *  placeholder. */
    defaultAmount?: number | null;
  } | null>(null);

  const del = useDeleteVendor();
  const confirm = useConfirm();

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
        "Permanently removes this talent record and all logged monthly payments. Cannot be undone.",
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

  // Round 3D.1 (Gustavo): the grid starts EMPTY. The visible-row set
  // is derived from payments that actually exist for the year — only
  // vendors with ≥1 payment surface. "+Add talent" still picks from
  // the full talent_we_pay list via VendorDialog, and adding a
  // payment via the dialog will make the vendor appear on the grid.
  //
  // First load all talent_we_pay vendors (the dialog's universe) and
  // their full-year payment map. Then narrow `tracked` to those that
  // actually have payment rows for the year.
  const allVendorIds = React.useMemo(() => (vendors ?? []).map((v) => v.id), [vendors]);
  const { data: paymentsByVendor, isLoading: paymentsLoading } = useVendorPaymentsByVendors(allVendorIds, year);

  const tracked = React.useMemo(() => {
    if (!vendors || !paymentsByVendor) return [];
    const trackedIds = new Set(Object.keys(paymentsByVendor));
    return vendors.filter((v) => trackedIds.has(v.id));
  }, [vendors, paymentsByVendor]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = tracked;
    if (q) {
      rows = rows.filter((v) =>
        [v.name, v.contact_name, v.contact_email, v.notes].some(
          (f) => f && f.toLowerCase().includes(q),
        ),
      );
    }
    return rows;
  }, [tracked, search]);

  // Apply status filter after loading payments (vendor row stays visible
  // if any of their cells matches).
  const filteredByStatus = React.useMemo(() => {
    if (statusFilter === "all") return filtered;
    return filtered.filter((v) => {
      const cells = paymentsByVendor?.[v.id] ?? {};
      return Object.values(cells).some((p) => p.status === statusFilter);
    });
  }, [filtered, paymentsByVendor, statusFilter]);

  // "Now" cursor — current month if we're in this year, else null.
  const now = new Date();
  const currentMonthIdx =
    year === now.getFullYear() ? now.getMonth() : null;

  // Reconciliation totals.
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
    const rows: { name: string; month: string; amount: number; status: string }[] = [];
    for (const v of filteredByStatus) {
      const cells = paymentsByVendor?.[v.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const p = cells[m];
        if (!p) continue;
        rows.push({
          name: v.name,
          month: `${MONTHS[m - 1]} ${year}`,
          amount: Number(p.amount) || 0,
          status: p.status,
        });
      }
    }
    return rows;
  }, [filteredByStatus, paymentsByVendor, year]);

  const isLoading = vendorsLoading || paymentsLoading;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EyebrowLabel withRule>Talent We Pay · {year}</EyebrowLabel>
          <h2 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
            Outgoing
          </h2>
          <p className="mt-1 max-w-[60ch] text-[13px] text-steel">
            One-off contractors and collaborators Recast pays a flat
            amount. Click any cell to log or edit the monthly payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCSVButton
            filename={`recast-talent-we-pay-${year}.csv`}
            rows={csvRows}
            label="Export CSV"
            disabled={csvRows.length === 0}
            columns={[
              { header: "Name",   value: (r) => r.name },
              { header: "Month",  value: (r) => r.month },
              { header: "Amount", value: (r) => r.amount.toFixed(2) },
              { header: "Status", value: (r) => r.status },
            ]}
          />
          <Button onClick={openAddVendor} size="sm" className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> Add talent
          </Button>
        </div>
      </div>

      {/* ── Filter row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" strokeWidth={1.5} />
          <Input
            placeholder="Search talent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[240px] rounded-md bg-card pl-8 text-[13px] placeholder:text-steel"
          />
        </div>
        <StatusFilterChips value={statusFilter} onChange={setStatusFilter} />
        <span className="ml-auto text-[12px] text-steel">
          {filteredByStatus.length} {filteredByStatus.length === 1 ? "person" : "people"} · {totals.cellCount} payment{totals.cellCount === 1 ? "" : "s"} YTD
        </span>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-lg" />
      ) : filteredByStatus.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          {tracked.length === 0
            ? `No payments logged yet for ${year}. Click "Add talent" to record one — the contractor will appear here automatically.`
            : "No matches for the current filter."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-[180px] bg-[#0d0d0d] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel"
                  >
                    Talent
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
                          isCurrent
                            ? "text-white"
                            : isFuture
                              ? "text-steel/40"
                              : "text-steel",
                        )}
                      >
                        {label}
                        {isCurrent ? <span className="ml-1 text-electric">·</span> : null}
                        {/* R4.A.2: lock badge for auto-locked (>6mo
                            old) months. */}
                        <MonthLockBadge year={year} month={i + 1} />
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
                      {/* Sticky-left talent column per spec §11. Edit +
                          Delete icons hide until row hover (spec §11
                          "Actions hide until row hover" + canonical
                          quiet-icon delete rule). */}
                      <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-white">
                              {v.name}
                            </div>
                            <div className="text-[11px] text-steel">
                              {v.payment_method
                                ? PAYMENT_METHOD_SHORT[v.payment_method] ?? v.payment_method
                                : "Unspecified"}
                            </div>
                          </div>
                          {/* Always-visible action icons. Spec §11
                              suggests "actions hide until row hover"
                              but user feedback was that the icons
                              were so muted they read as absent. Now
                              shown at 70% steel by default; hover
                              promotes to full white on a 6% tint
                              background so it's clear they're
                              interactive. The destructive confirm
                              dialog still gates the actual delete. */}
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => openEditVendor(v)}
                              title="Edit talent details"
                              aria-label={`Edit ${v.name}`}
                              className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteVendor(v)}
                              title="Delete talent"
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
                        // R3D.2 + R4.A.2:
                        //   canCreate — past-month new-entry block.
                        //   canEdit   — 6-month auto-lock on existing
                        //               rows. Both honour
                        //               unlocked_periods overrides.
                        const canCreate = lock.canCreate(year, month);
                        const canEdit = lock.canEdit(year, month);
                        // Round 4: recurring placeholder only when
                        // canCreate (no point pre-filling a closed
                        // month).
                        const showRecurring =
                          v.recurring_monthly &&
                          v.recurring_amount != null &&
                          v.recurring_amount > 0 &&
                          !p &&
                          canCreate &&
                          !isFuture;
                        return (
                          <td key={month} className="p-1 align-middle">
                            {p && p.amount != null ? (
                              <InvoiceCell
                                amount={Number(p.amount) || 0}
                                ref_={p.invoice_url ? "↗ link" : "—"}
                                status={p.status}
                                future={isFuture}
                                onClick={
                                  canEdit
                                    ? () => setEditingCell({ vendorId: v.id, month, existing: p })
                                    : undefined
                                }
                                disabled={!canEdit}
                                className={cn(!canEdit && "cursor-not-allowed opacity-60")}
                                title={
                                  canEdit
                                    ? undefined
                                    : `${MONTHS[month - 1]} ${year} is locked. Admin or finance can unlock from the column header.`
                                }
                              />
                            ) : showRecurring ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingCell({
                                    vendorId: v.id,
                                    month,
                                    existing: null,
                                    defaultAmount: v.recurring_amount,
                                  })
                                }
                                className="block h-full w-full rounded-sm border border-dashed border-electric/50 bg-electric/[0.04] px-2 py-1.5 text-center transition-colors duration-base ease-out hover:bg-electric/[0.10]"
                                title={`Expected $${v.recurring_amount?.toFixed(2)} for ${MONTHS[month - 1]} ${year} — click to log`}
                              >
                                <div className="tabular text-[12px] font-semibold leading-none text-electric">
                                  ${(v.recurring_amount ?? 0).toFixed(0)}
                                </div>
                                <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-electric/70">
                                  Expected
                                </div>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canCreate}
                                onClick={() =>
                                  setEditingCell({
                                    vendorId: v.id,
                                    month,
                                    existing: p ?? null,
                                  })
                                }
                                className={cn(
                                  "block h-full w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                                  isFuture && "opacity-50",
                                  !canCreate && "cursor-not-allowed opacity-20 hover:bg-transparent hover:text-steel/30",
                                )}
                                title={
                                  !canCreate
                                    ? `${MONTHS[month - 1]} ${year} is closed — past months are locked. Admin/finance can unlock from the column header to log a back-dated payment.`
                                    : `Log ${MONTHS[month - 1]} ${year} payment for ${v.name}`
                                }
                              >
                                +
                              </button>
                            )}
                          </td>
                        );
                      })}

                      {/* YTD column */}
                      <td className="px-3 py-2 text-right">
                        {total > 0 ? (
                          <div className="flex flex-col items-end leading-tight">
                            <MoneyCell
                              amount={total}
                              size="body"
                              splitDecimals={false}
                            />
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

      {/* ── Reconciliation strip per spec §11 ─────────────────────── */}
      {!isLoading && filteredByStatus.length > 0 ? (
        <ReconciliationStrip totals={totals} />
      ) : null}

      {/* Cell edit dialog */}
      {editingCell ? (
        <PaymentCellDialog
          open
          onOpenChange={(o) => !o && setEditingCell(null)}
          vendorId={editingCell.vendorId}
          year={year}
          month={editingCell.month}
          existing={editingCell.existing}
          defaultAmount={editingCell.defaultAmount}
        />
      ) : null}

      {/* Vendor dialog — handles both add (vendor=null) and edit
          (vendor=editingVendor). Closing resets editingVendor so the
          next "+ Add talent" click opens in create mode. */}
      <VendorDialog
        open={vendorDialogOpen}
        onOpenChange={(o) => {
          setVendorDialogOpen(o);
          if (!o) setEditingVendor(null);
        }}
        defaultKind="talent_we_pay"
        vendor={editingVendor}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers (mirrored from C2 for one-page-fits-the-spec coherence)
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
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
        {label}
      </div>
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

