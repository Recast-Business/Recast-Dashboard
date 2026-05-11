import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { EyebrowLabel, InvoiceCell, MoneyCell } from "@/components/recast";
import { useCreators } from "@/hooks/useCreators";
import { useTalentInvoicesByYear } from "@/hooks/useTalentInvoices";
import { TalentInvoiceDialog } from "@/components/finance/TalentInvoiceDialog";
import type { PaymentStatusV2, TalentInvoice } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";
import { useLockState } from "@/hooks/useLockState";
import { MonthLockBadge } from "@/components/finance/MonthLockBadge";

/**
 * Phase L (C2): Talent Paying Us — invoice grid.
 *
 * Rebuilt around the canonical design system (DESIGN.md):
 *
 *   • The "cell IS the invoice" model — each table cell is an
 *     <InvoiceCell> button with status border-l + 6×6 corner pip +
 *     5–7% tint background (per spec §11)
 *   • Sticky-left creator column with bg #0d0d0d (per spec §11
 *     "Sticky-left creator column. The grid uses position: sticky;
 *     left: 0; z-index: 1; background: #0d0d0d")
 *   • "Now" cursor — current month X-axis label is bold + white,
 *     future months are dimmed at 40% opacity, with a vertical
 *     dashed guide line through the column (Recharts-style)
 *   • Reconciliation strip footer — 4 cells, the 4th ("Outstanding")
 *     gets the canonical Electric-Blue 6% tint background and renders
 *     its value at 30px display weight while the other three sit at
 *     22px (per spec §11 "Reconciliation strip")
 *   • Money in Unbounded throughout (font-display via MoneyCell)
 *   • Hairline border elevation, no shadows
 *   • Section eyebrow with the 24px Electric Blue rule prefix
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  year: number;
}

export function TalentInvoiceGrid({ year }: Props) {
  // Round 3D.1 (Gustavo): the grid no longer auto-populates from
  // `useCreators("signed")`. Instead it derives the set of creator
  // rows from invoices that actually exist for the year — so the
  // page starts COMPLETELY EMPTY until you add a real invoice via
  // "+ Add invoice". `useCreators` is still loaded so the dialog's
  // creator picker can offer the full Talent Ledger.
  const { data: allCreators, isLoading: creatorsLoading } = useCreators("signed");
  const { data: invoiceMap, isLoading: invoicesLoading } = useTalentInvoicesByYear(year);

  // The visible-row source: only creators with ≥1 invoice in this
  // year. Empty until invoices land.
  const creators = React.useMemo(() => {
    if (!allCreators || !invoiceMap) return [];
    const trackedIds = new Set(Object.keys(invoiceMap));
    return allCreators.filter((c) => trackedIds.has(c.id));
  }, [allCreators, invoiceMap]);

  const lock = useLockState();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatusV2 | "all">("all");
  const [editing, setEditing] = React.useState<TalentInvoice | null>(null);
  const [creating, setCreating] = React.useState<{
    creatorId: string;
    year: number;
    month: number;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // "Now" cursor — current month if we're in this year, else null.
  const now = new Date();
  const currentMonthIdx =
    year === now.getFullYear() ? now.getMonth() : null; // 0-based or null

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = creators ?? [];
    if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q));
    if (statusFilter !== "all") {
      // A creator-row is included if any of their cells matches the filter.
      rows = rows.filter((c) => {
        const cells = invoiceMap?.[c.id] ?? {};
        return Object.values(cells).some((inv) => inv.status === statusFilter);
      });
    }
    return rows;
  }, [creators, search, statusFilter, invoiceMap]);

  function openCell(creatorId: string, month: number) {
    const existing = invoiceMap?.[creatorId]?.[month];
    if (existing) {
      setEditing(existing);
      setCreating(null);
    } else {
      setCreating({ creatorId, year, month });
      setEditing(null);
    }
    setDialogOpen(true);
  }
  function openCreateBlank() {
    setEditing(null);
    setCreating(null);
    setDialogOpen(true);
  }

  // Yearly totals across visible creators (for the reconciliation strip).
  const totals = React.useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let invoiceCount = 0;
    let paidCount = 0;
    for (const c of filtered) {
      const cells = invoiceMap?.[c.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const inv = cells[m];
        if (!inv) continue;
        invoiceCount++;
        totalInvoiced += Number(inv.amount) || 0;
        totalPaid += Number(inv.amount_paid) || 0;
        if (inv.status === "paid") paidCount++;
      }
    }
    return {
      totalInvoiced,
      totalPaid,
      invoiceCount,
      paidCount,
      outstanding: Math.max(0, totalInvoiced - totalPaid),
      pctPaid: invoiceCount > 0 ? Math.round((paidCount / invoiceCount) * 100) : 0,
    };
  }, [filtered, invoiceMap]);

  const isLoading = creatorsLoading || invoicesLoading;

  // Flat row list for CSV export (creator × month → flat invoice rows).
  const csvRows = React.useMemo(() => {
    const rows: { creator: string; month: string; amount: number; ref: string; status: string }[] = [];
    for (const c of filtered) {
      const cells = invoiceMap?.[c.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const inv = cells[m];
        if (!inv) continue;
        rows.push({
          creator: c.name,
          month: `${MONTHS[m - 1]} ${year}`,
          amount: Number(inv.amount) || 0,
          ref: inv.invoice_number ?? "—",
          status: inv.status,
        });
      }
    }
    return rows;
  }, [filtered, invoiceMap, year]);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EyebrowLabel withRule>Talent Paying Us · {year}</EyebrowLabel>
          <h2 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
            Invoices
          </h2>
          <p className="mt-1 max-w-[60ch] text-[13px] text-steel">
            One invoice per creator per month. Click any cell to view or
            create the invoice. Status is communicated by the cell's left
            border + corner pip — paid green, partial amber, overdue red,
            unpaid grey.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCSVButton
            filename={`recast-talent-paying-us-${year}.csv`}
            rows={csvRows}
            label="Export CSV"
            disabled={csvRows.length === 0}
            columns={[
              { header: "Creator", value: (r) => r.creator },
              { header: "Month",   value: (r) => r.month },
              { header: "Amount",  value: (r) => r.amount.toFixed(2) },
              { header: "Ref",     value: (r) => r.ref },
              { header: "Status",  value: (r) => r.status },
            ]}
          />
          <Button onClick={openCreateBlank} size="sm" className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> Add invoice
          </Button>
        </div>
      </div>

      {/* ── Filter row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" strokeWidth={1.5} />
          <Input
            placeholder="Search creator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[240px] rounded-md bg-card pl-8 text-[13px] placeholder:text-steel"
          />
        </div>
        <StatusFilterChips value={statusFilter} onChange={setStatusFilter} />
        <span className="ml-auto text-[12px] text-steel">
          {filtered.length} creator{filtered.length === 1 ? "" : "s"} · {totals.invoiceCount} invoice{totals.invoiceCount === 1 ? "" : "s"} YTD
        </span>
      </div>

      {/* ── Grid card ──────────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-lg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          {creators.length === 0
            ? "No invoices logged yet for " + year +
              ". Click “Add invoice” to record one — the creator will appear here automatically."
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
                    Creator
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
                        {isCurrent ? (
                          <span className="ml-1 text-electric">·</span>
                        ) : null}
                        {/* R4.A.2: lock badge for auto-locked (>6mo
                            old) months. Renders nothing for recent
                            months. */}
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
                {filtered.map((c) => {
                  const cells = invoiceMap?.[c.id] ?? {};
                  let creatorTotal = 0;
                  let creatorInvoiceCount = 0;
                  for (let m = 1; m <= 12; m++) {
                    const inv = cells[m];
                    if (inv) {
                      creatorTotal += Number(inv.amount) || 0;
                      creatorInvoiceCount++;
                    }
                  }
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    >
                      {/* Sticky-left creator column per spec §11 */}
                      <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2">
                        <div className="text-[13px] font-medium text-white">
                          {c.name}
                        </div>
                        {c.category ? (
                          <div className="text-[11px] text-steel">
                            {c.category}
                          </div>
                        ) : null}
                      </td>

                      {MONTHS.map((_label, i) => {
                        const month = i + 1;
                        const inv = cells[month];
                        const isFuture =
                          currentMonthIdx !== null && i > currentMonthIdx;
                        // R3D.2 + R4.A.2:
                        //   canCreate — gate the "+" placeholder.
                        //     False for past months (R3D.2); unlock
                        //     overrides via lock.canCreate.
                        //   canEdit   — gate existing-row clicks.
                        //     False for months older than 6 (R4.A.2);
                        //     unlock overrides via lock.canEdit.
                        const canCreate = lock.canCreate(year, month);
                        const canEdit = lock.canEdit(year, month);
                        return (
                          <td key={month} className="p-1 align-middle">
                            {inv ? (
                              <InvoiceCell
                                amount={Number(inv.amount) || 0}
                                ref_={inv.invoice_number ?? "—"}
                                status={inv.status as PaymentStatusV2}
                                future={isFuture}
                                onClick={canEdit ? () => openCell(c.id, month) : undefined}
                                disabled={!canEdit}
                                className={cn(!canEdit && "cursor-not-allowed opacity-60")}
                                title={
                                  canEdit
                                    ? undefined
                                    : `${MONTHS[month - 1]} ${year} is locked. Admin or finance can unlock from the column header.`
                                }
                              />
                            ) : (
                              <button
                                type="button"
                                disabled={!canCreate}
                                onClick={() => openCell(c.id, month)}
                                className={cn(
                                  "block h-full w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                                  isFuture && "opacity-50",
                                  !canCreate && "cursor-not-allowed opacity-20 hover:bg-transparent hover:text-steel/30",
                                )}
                                title={
                                  !canCreate
                                    ? `${MONTHS[month - 1]} ${year} is closed — past months are locked. Admin/finance can unlock from the column header to log a back-dated invoice.`
                                    : `Add ${MONTHS[month - 1]} ${year} invoice for ${c.name}`
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
                        {creatorTotal > 0 ? (
                          <div className="flex flex-col items-end leading-tight">
                            <MoneyCell
                              amount={creatorTotal}
                              size="body"
                              splitDecimals={false}
                            />
                            <span className="text-[10px] text-steel">
                              {creatorInvoiceCount} {creatorInvoiceCount === 1 ? "invoice" : "invoices"}
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
      {!isLoading && filtered.length > 0 ? (
        <ReconciliationStrip totals={totals} />
      ) : null}

      {dialogOpen && (
        <TalentInvoiceDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setDialogOpen(false);
              setEditing(null);
              setCreating(null);
            }
          }}
          invoice={editing}
          defaultCreatorId={creating?.creatorId}
          defaultYear={creating?.year}
          defaultMonth={creating?.month}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Status filter chips — segmented control above the grid.
// ─────────────────────────────────────────────────────────────────────

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
              active
                ? "bg-white/[0.06] text-white"
                : "text-steel hover:text-white",
            )}
          >
            {o.tone && active ? (
              <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                o.tone === "paid" && "bg-paid",
                o.tone === "partial" && "bg-partial",
                o.tone === "overdue" && "bg-overdue",
              )} />
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reconciliation strip — 4 cells, last one tinted blue per spec §11.
// "The 4th cell ('Outstanding') gets a tinted blue background
//  rgba(37, 99, 235, 0.06) and the value uses the 30px display
//  weight. The other three cells are 22px."
// ─────────────────────────────────────────────────────────────────────

function ReconciliationStrip({
  totals,
}: {
  totals: {
    totalInvoiced: number;
    totalPaid: number;
    invoiceCount: number;
    paidCount: number;
    outstanding: number;
    pctPaid: number;
  };
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
      <ReconciliationCell
        label="Invoices paid"
        value={`${totals.paidCount}/${totals.invoiceCount}`}
        sub={`${totals.pctPaid}% of issued`}
      />
      <ReconciliationCell
        label="Total invoiced"
        value={formatUSD(totals.totalInvoiced, { decimals: 0 })}
        sub="YTD billed"
      />
      <ReconciliationCell
        label="Total paid"
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
        // Per spec: the 4th cell ("Outstanding") gets a 6% Electric
        // Blue tint background. Other three cells stay default.
        tone === "electric" && "bg-[rgba(37,99,235,0.06)]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
        {label}
      </div>
      {/* Per spec: emphasised cell uses 30px display weight, others 22px. */}
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
