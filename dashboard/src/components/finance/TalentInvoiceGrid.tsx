import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { EyebrowLabel, InvoiceCell, MoneyCell } from "@/components/recast";
import { useCreators } from "@/hooks/useCreators";
import { useTalentInvoicesByYear } from "@/hooks/useTalentInvoices";
import { useTalentGridTracking } from "@/hooks/useTalentGridTracking";
import { TalentInvoiceDialog } from "@/components/finance/TalentInvoiceDialog";
import { TalentMonthInvoicesDialog } from "@/components/finance/TalentMonthInvoicesDialog";
import { AddTalentToGridDialog } from "@/components/finance/AddTalentToGridDialog";
import type { PaymentStatusV2, TalentInvoice } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";
import { useLockState } from "@/hooks/useLockState";
import { useAuth } from "@/auth/AuthProvider";
import { MonthLockBadge } from "@/components/finance/MonthLockBadge";
import { effectiveInvoiceStatus } from "@/lib/finance/invoiceStatus";

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

/**
 * R5 follow-up (Gus): with multiple invoices allowed per cell, the
 * cell's status pill needs a worst-status aggregation. Order of
 * severity: overdue > partial > unpaid > paid. Any overdue invoice
 * makes the cell overdue. All-paid → paid. Else partial if any is
 * partial, otherwise unpaid.
 *
 * Statuses are computed via effectiveInvoiceStatus so an invoice
 * past its due date with no payment still reads overdue even if the
 * stored status hasn't been flipped.
 */
function aggregateCellStatus(invoices: TalentInvoice[]): PaymentStatusV2 {
  const statuses = invoices.map((inv) => effectiveInvoiceStatus(inv));
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("partial")) return "partial";
  if (statuses.every((s) => s === "paid")) return "paid";
  return "unpaid";
}

interface Props {
  year: number;
}

export function TalentInvoiceGrid({ year }: Props) {
  // R5 follow-up (roles audit): partner now has READ-ONLY access to
  // the Invoice page. canWrite gates the "+ Add Talent" button and
  // every write affordance in the child dialogs. RLS at the DB layer
  // is the actual guarantee; this just keeps partner UX clean
  // (no clickable buttons that would toast-fail).
  const { role } = useAuth();
  const canWrite = role === "admin" || role === "finance";
  // R5 follow-up (Gus): the grid's row set is now the UNION of two
  // sources, not "only creators with ≥1 invoice":
  //   1. talent_grid_tracking rows for (paying_us, year) — explicit
  //      rows the user added via "+ Add Talent".
  //   2. creators with ≥1 invoice in the year — keeps historical
  //      data visible even if no tracking row was ever inserted.
  // The button at the top adds rows to (1); per-month "+" cells
  // continue to drive invoice creation.
  const { data: allCreators, isLoading: creatorsLoading } = useCreators("signed");
  const { data: invoiceMap, isLoading: invoicesLoading } = useTalentInvoicesByYear(year);
  const { data: tracking } = useTalentGridTracking("paying_us", year);

  const creators = React.useMemo(() => {
    if (!allCreators) return [];
    const visibleIds = new Set<string>();
    for (const id of Object.keys(invoiceMap ?? {})) visibleIds.add(id);
    for (const t of tracking ?? []) {
      if (t.creator_id) visibleIds.add(t.creator_id);
    }
    return allCreators.filter((c) => visibleIds.has(c.id));
  }, [allCreators, invoiceMap, tracking]);

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
  // R5 follow-up: separate state for the "+ Add Talent" picker. The
  // invoice dialog (above) only opens when the user clicks a per-month
  // "+" cell.
  const [addTalentOpen, setAddTalentOpen] = React.useState(false);

  // "Now" cursor — current month if we're in this year, else null.
  const now = new Date();
  const currentMonthIdx =
    year === now.getFullYear() ? now.getMonth() : null; // 0-based or null

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = creators ?? [];
    if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q));
    if (statusFilter !== "all") {
      // R5 follow-up: filter uses the EFFECTIVE (compute-at-render)
      // status across ANY invoice in the cell so "Overdue" surfaces
      // rows whose stored status hasn't been flipped yet. With
      // multi-invoice cells (migration 0047), any one matching
      // invoice keeps the row visible.
      rows = rows.filter((c) => {
        const cells = invoiceMap?.[c.id] ?? {};
        for (const monthInvs of Object.values(cells)) {
          for (const inv of monthInvs) {
            if (effectiveInvoiceStatus(inv) === statusFilter) return true;
          }
        }
        return false;
      });
    }
    return rows;
  }, [creators, search, statusFilter, invoiceMap]);

  // R5 follow-up (Gus): per-month list dialog state. Distinct from
  // the create/edit dialog above — opened when the user clicks a
  // cell that already has invoices. Empty cells still open the
  // create dialog directly via openCell().
  const [monthListOpen, setMonthListOpen] = React.useState(false);
  const [monthListContext, setMonthListContext] = React.useState<{
    creatorId: string;
    month: number;
  } | null>(null);

  function openCell(creatorId: string, month: number) {
    const list = invoiceMap?.[creatorId]?.[month] ?? [];
    if (list.length === 0) {
      // R5 follow-up (roles audit): partner shouldn't reach the
      // create form. Empty-cell click no-ops for partner. With
      // invoices present, the list dialog still opens read-only.
      if (!canWrite) return;
      // Empty cell: jump straight to the create form for this slot.
      setCreating({ creatorId, year, month });
      setEditing(null);
      setDialogOpen(true);
      return;
    }
    // 1+ invoices: route through the per-month list dialog. Lets the
    // user pick which to edit, delete one, or add another. For
    // partner the dialog opens with edit/delete/add affordances
    // hidden (gated inside the dialog via canWrite).
    setMonthListContext({ creatorId, month });
    setMonthListOpen(true);
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
        const list = cells[m] ?? [];
        for (const inv of list) {
          invoiceCount++;
          totalInvoiced += Number(inv.amount) || 0;
          totalPaid += Number(inv.amount_paid) || 0;
          // R5 follow-up: count using effective status so a fully-paid
          // row counts as paid even if the stored status lags.
          if (effectiveInvoiceStatus(inv) === "paid") paidCount++;
        }
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

  // Flat row list for CSV export (creator × month × invoice → flat).
  // Multi-invoice months become multiple CSV rows so the export
  // doesn't lose the per-invoice detail.
  const csvRows = React.useMemo(() => {
    const rows: { creator: string; month: string; amount: number; ref: string; status: string }[] = [];
    for (const c of filtered) {
      const cells = invoiceMap?.[c.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const list = cells[m] ?? [];
        for (const inv of list) {
          rows.push({
            creator: c.name,
            month: `${MONTHS[m - 1]} ${year}`,
            amount: Number(inv.amount) || 0,
            ref: inv.invoice_number ?? "—",
            status: inv.status,
          });
        }
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
          {/* R5 follow-up (Gus): button now adds a TALENT ROW to the
              grid, not an invoice. Per-month "+" cells continue to
              drive invoice creation. Hidden for partner — read-only
              role audit, R5 follow-up. */}
          {canWrite ? (
            <Button onClick={() => setAddTalentOpen(true)} size="sm" className="h-8">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Talent
            </Button>
          ) : null}
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
            ? `No talent on the ${year} grid yet. Click "Add Talent" to pick from the Roster — they'll appear here with empty monthly cells you can fill in.`
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
                    const list = cells[m] ?? [];
                    for (const inv of list) {
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
                        const list = cells[month] ?? [];
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
                        // R5 follow-up (Gus): aggregate when > 0
                        // invoices in the cell. Single-invoice cells
                        // look identical to before; multi-invoice
                        // cells show the SUM amount + a small "N×"
                        // count badge top-right so the user can spot
                        // them at a glance.
                        const cellAmount = list.reduce(
                          (s, inv) => s + (Number(inv.amount) || 0),
                          0,
                        );
                        const cellStatus =
                          list.length > 0 ? aggregateCellStatus(list) : "unpaid";
                        const cellRef =
                          list.length === 1
                            ? list[0].invoice_number ?? "—"
                            : list.length > 1
                              ? `${list.length} invoices`
                              : "—";
                        return (
                          <td key={month} className="relative p-1 align-middle">
                            {list.length > 0 ? (
                              <>
                                <InvoiceCell
                                  amount={cellAmount}
                                  ref_={cellRef}
                                  status={cellStatus}
                                  future={isFuture}
                                  onClick={canEdit ? () => openCell(c.id, month) : undefined}
                                  disabled={!canEdit}
                                  className={cn(!canEdit && "cursor-not-allowed opacity-60")}
                                  title={
                                    canEdit
                                      ? list.length > 1
                                        ? `${list.length} invoices for ${MONTHS[month - 1]} ${year} — click to view, edit, or add another`
                                        : undefined
                                      : `${MONTHS[month - 1]} ${year} is locked. Admin or finance can unlock from the column header.`
                                  }
                                />
                                {list.length > 1 ? (
                                  <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-sm bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                                    {list.length}×
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={!canCreate || !canWrite}
                                onClick={() => openCell(c.id, month)}
                                className={cn(
                                  "block h-full w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                                  isFuture && "opacity-50",
                                  (!canCreate || !canWrite) &&
                                    "cursor-not-allowed opacity-20 hover:bg-transparent hover:text-steel/30",
                                )}
                                title={
                                  !canWrite
                                    ? "Read-only — partner role can't create invoices."
                                    : !canCreate
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

      {/* R5 follow-up: "+ Add Talent" picker — separate state from the
          invoice dialog. Adding a talent only inserts a tracking row;
          the user still uses per-month "+" cells to create invoices. */}
      <AddTalentToGridDialog
        open={addTalentOpen}
        onOpenChange={setAddTalentOpen}
        side="paying_us"
        year={year}
      />

      {/* R5 follow-up (Gus): per-month list dialog. Mounts when a
          non-empty cell is clicked. Edit / delete / add-another all
          live here. The TalentInvoiceDialog still does the actual
          form work — this dialog just hands off via setEditing /
          setCreating + setDialogOpen. */}
      {monthListContext ? (
        <TalentMonthInvoicesDialog
          open={monthListOpen}
          onOpenChange={(o) => {
            if (!o) {
              setMonthListOpen(false);
              setMonthListContext(null);
            }
          }}
          canWrite={canWrite}
          creatorId={monthListContext.creatorId}
          creatorName={
            (creators ?? []).find((c) => c.id === monthListContext.creatorId)?.name
              ?? "(unknown)"
          }
          year={year}
          month={monthListContext.month}
          invoices={
            invoiceMap?.[monthListContext.creatorId]?.[monthListContext.month] ?? []
          }
          onEdit={(inv) => {
            // Hand off to the existing invoice form in edit mode.
            setEditing(inv);
            setCreating(null);
            setDialogOpen(true);
            setMonthListOpen(false);
            setMonthListContext(null);
          }}
          onCreate={() => {
            // Hand off to the existing invoice form in create mode,
            // pre-scoped to this (creator, month).
            setEditing(null);
            setCreating({
              creatorId: monthListContext.creatorId,
              year,
              month: monthListContext.month,
            });
            setDialogOpen(true);
            setMonthListOpen(false);
            setMonthListContext(null);
          }}
        />
      ) : null}
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
