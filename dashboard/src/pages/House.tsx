import * as React from "react";
import { Calendar, ChevronDown, Pencil, Trash2, UserPlus, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { EyebrowLabel, InvoiceCell, MoneyCell } from "@/components/recast";
import {
  useRentGroups,
  useHouseUtilities,
  useHouseResidents,
  useHouseRentPayments,
  useHouseUtilityPayments,
  useDeleteUtility,
  useResidentsByGroup,
} from "@/hooks/useHouse";
import { HouseCellDialog } from "@/components/finance/HouseCellDialog";
import { ResidentDialog } from "@/components/finance/ResidentDialog";
import { UtilityDialog } from "@/components/finance/UtilityDialog";
import { UtilitySplitsPanel } from "@/components/finance/UtilitySplitsPanel";
import { HousePaymentLogPanel } from "@/components/finance/HousePaymentLogPanel";
import { useConfirm } from "@/hooks/useConfirm";
import { useSharedYear } from "@/hooks/useSharedYear";
import type {
  HouseRentPayment,
  HouseUtility,
  HouseUtilityPayment,
  RentGroup,
} from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase L (C5): Frazier's House — rent + utility ledger.
 *
 * Promoted from a Finance tab to its own top-level route under the
 * Ledgers sidebar group, mirroring C4's Vendors promotion.
 *
 * Two grids on one page (per the spec § structure for the household
 * mockup):
 *   • Rent — one row per rent_group × 12 months. Rent is keyed by
 *     group (M-2 schema) so Harriet & Keenan share one rent row but
 *     stay separate for utility splits.
 *   • Utilities — one row per utility × 12 months. Each utility's
 *     monthly bill is a single number; per-resident split lives on
 *     the M-3b roadmap (deferred).
 *
 * Both grids use the canonical recipes from C2 / C3 / C4:
 *   • Sticky-left first column at bg-#0d0d0d
 *   • <InvoiceCell> for each populated month, dashed-border + for
 *     empties; current-month label highlighted; future months dimmed
 *   • Always-visible Edit + Delete (steel quiet icons) on each row
 *
 * Combined reconciliation strip footer at the bottom (4 cells, 4th
 * tinted Electric Blue 6%).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function HousePage() {
  // Round-1 efficiency: year pick persists across pages/sessions.
  const [year, setYear] = useSharedYear();

  const { data: rentGroups, isLoading: rentGroupsLoading } = useRentGroups({ includeInactive: false });
  const { data: utilities, isLoading: utilitiesLoading } = useHouseUtilities({ includeInactive: false });
  const { data: residents } = useHouseResidents({ includeInactive: false });
  const { data: rentByGroup, isLoading: rentLoading } = useHouseRentPayments(year);
  const { data: utilByUtility, isLoading: utilPayLoading } = useHouseUtilityPayments(year);
  const residentsByGroup = useResidentsByGroup();
  const activeResidentCount = (residents ?? []).length;

  // Dialog state
  const [residentDialogOpen, setResidentDialogOpen] = React.useState(false);
  const [utilityDialog, setUtilityDialog] = React.useState<{ open: boolean; utility: HouseUtility | null }>({
    open: false,
    utility: null,
  });
  const [rentCellEdit, setRentCellEdit] = React.useState<{
    group: RentGroup;
    month: number;
    existing: HouseRentPayment | null;
  } | null>(null);
  const [utilCellEdit, setUtilCellEdit] = React.useState<{
    utility: HouseUtility;
    month: number;
    existing: HouseUtilityPayment | null;
  } | null>(null);

  const delUtility = useDeleteUtility();
  const confirm = useConfirm();

  const now = new Date();
  const currentMonthIdx = year === now.getFullYear() ? now.getMonth() : null;

  // Combined totals across rent + utilities for the reconciliation strip.
  const totals = React.useMemo(() => {
    let rentBilled = 0;
    let rentPaid = 0;
    let rentCount = 0;
    let rentPaidCount = 0;
    for (const g of rentGroups ?? []) {
      const cells = rentByGroup?.[g.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const p = cells[m];
        if (!p) continue;
        rentCount++;
        rentBilled += Number(p.amount) || 0;
        if (p.status === "paid") {
          rentPaidCount++;
          rentPaid += Number(p.amount) || 0;
        }
      }
    }
    let utilBilled = 0;
    let utilPaid = 0;
    let utilCount = 0;
    let utilPaidCount = 0;
    for (const u of utilities ?? []) {
      const cells = utilByUtility?.[u.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const p = cells[m];
        if (!p) continue;
        utilCount++;
        utilBilled += Number(p.amount) || 0;
        if (p.status === "paid") {
          utilPaidCount++;
          utilPaid += Number(p.amount) || 0;
        }
      }
    }
    const totalBilled = rentBilled + utilBilled;
    const totalPaid = rentPaid + utilPaid;
    return {
      rentBilled,
      rentPaid,
      rentCount,
      rentPaidCount,
      utilBilled,
      utilPaid,
      utilCount,
      utilPaidCount,
      totalBilled,
      totalPaid,
      outstanding: Math.max(0, totalBilled - totalPaid),
      pctPaid:
        rentCount + utilCount > 0
          ? Math.round(((rentPaidCount + utilPaidCount) / (rentCount + utilCount)) * 100)
          : 0,
    };
  }, [rentGroups, rentByGroup, utilities, utilByUtility]);

  async function onDeleteUtility(u: HouseUtility) {
    const ok = await confirm({
      title: `Delete ${u.utility_name}?`,
      description:
        "Permanently removes this utility and every logged monthly bill. Cannot be undone.",
      confirmLabel: "Delete utility",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await delUtility.mutateAsync(u.id);
      toast.success(`${u.utility_name} deleted`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  const isLoading = rentGroupsLoading || utilitiesLoading || rentLoading || utilPayLoading;

  return (
    <div className="space-y-6">
      {/* Top eyebrow strip */}
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        Ledgers · Household
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EyebrowLabel withRule>Frazier&apos;s House · {year}</EyebrowLabel>
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            Frazier&apos;s House
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
            Rent + utilities for the Recast residence. Rent rows are
            keyed by group so couples paying together share one row;
            utilities split equal-per-head among active residents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setResidentDialogOpen(true)}
            title="Add a new resident"
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Add resident
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setUtilityDialog({ open: true, utility: null })}
            title="Add a new utility line"
          >
            <Zap className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Add utility
          </Button>
          <YearChip value={year} onChange={setYear} />
        </div>
      </div>

      {/* ── Rent grid ───────────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-rule px-tile-md py-3.5">
          <EyebrowLabel withRule>Bedrooms · Rent</EyebrowLabel>
          <h2 className="mt-1.5 text-[13px] font-semibold tracking-[-0.005em] text-white">
            One row per rent group ·{" "}
            <span className="text-steel">click any cell to edit the monthly bill</span>
          </h2>
        </div>

        {isLoading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : (rentGroups?.length ?? 0) === 0 ? (
          <div className="px-tile-md py-8 text-center text-[13px] text-steel">
            No rent groups yet — click <span className="text-white">Add resident</span> to
            create the household&apos;s first rent group.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <GridHeader currentMonthIdx={currentMonthIdx} firstColLabel="Group" />
              <tbody>
                {(rentGroups ?? []).map((g) => {
                  const cells = rentByGroup?.[g.id] ?? {};
                  let total = 0;
                  let cellCount = 0;
                  for (let m = 1; m <= 12; m++) {
                    const p = cells[m];
                    if (p) {
                      total += Number(p.amount) || 0;
                      cellCount++;
                    }
                  }
                  const residents = residentsByGroup?.[g.id] ?? [];
                  return (
                    <tr
                      key={g.id}
                      className="border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    >
                      <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2">
                        <div className="text-[13px] font-medium text-white">{g.label}</div>
                        <div className="text-[11px] text-steel">
                          {residents.length > 0
                            ? `${residents.length} resident${residents.length === 1 ? "" : "s"}`
                            : "No residents linked"}
                          {" · "}
                          {formatUSD(Number(g.monthly_rent) || 0, { decimals: 0 })}/mo
                        </div>
                      </td>
                      {MONTHS.map((_label, i) => {
                        const month = i + 1;
                        const p = cells[month];
                        const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                        return (
                          <td key={month} className="p-1 align-middle">
                            {p && p.amount != null ? (
                              <InvoiceCell
                                amount={Number(p.amount) || 0}
                                ref_={p.paid_at ? formatDateShort(p.paid_at) : "—"}
                                status={p.status}
                                future={isFuture}
                                onClick={() =>
                                  setRentCellEdit({
                                    group: g,
                                    month,
                                    existing: p,
                                  })
                                }
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setRentCellEdit({
                                    group: g,
                                    month,
                                    existing: p ?? null,
                                  })
                                }
                                className={cn(
                                  "block h-full w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                                  isFuture && "opacity-50",
                                )}
                                title={`Log ${MONTHS[month - 1]} ${year} rent for ${g.label}`}
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
                              {cellCount} {cellCount === 1 ? "month" : "months"}
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
        )}
      </Card>

      {/* ── Utilities grid ──────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-rule px-tile-md py-3.5">
          <EyebrowLabel withRule>Utilities</EyebrowLabel>
          <h2 className="mt-1.5 text-[13px] font-semibold tracking-[-0.005em] text-white">
            One row per utility ·{" "}
            <span className="text-steel">
              split equal-per-head among active residents (M-3b)
            </span>
          </h2>
        </div>

        {isLoading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : (utilities?.length ?? 0) === 0 ? (
          <div className="px-tile-md py-8 text-center text-[13px] text-steel">
            No utilities yet — click <span className="text-white">Add utility</span> to log
            the first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <GridHeader currentMonthIdx={currentMonthIdx} firstColLabel="Utility" />
              <tbody>
                {(utilities ?? []).map((u) => {
                  const cells = utilByUtility?.[u.id] ?? {};
                  let total = 0;
                  let cellCount = 0;
                  for (let m = 1; m <= 12; m++) {
                    const p = cells[m];
                    if (p) {
                      total += Number(p.amount) || 0;
                      cellCount++;
                    }
                  }
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    >
                      <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-white">
                              {u.utility_name}
                            </div>
                            <div className="text-[11px] text-steel">
                              Equal split · {cellCount} logged
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setUtilityDialog({ open: true, utility: u })}
                              title="Edit utility"
                              aria-label={`Edit ${u.utility_name}`}
                              className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteUtility(u)}
                              title="Delete utility"
                              aria-label={`Delete ${u.utility_name}`}
                              disabled={delUtility.isPending}
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
                        const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                        return (
                          <td key={month} className="p-1 align-middle">
                            {p && p.amount != null ? (
                              <InvoiceCell
                                amount={Number(p.amount) || 0}
                                ref_={p.paid_at ? formatDateShort(p.paid_at) : "—"}
                                status={p.status}
                                future={isFuture}
                                onClick={() =>
                                  setUtilCellEdit({
                                    utility: u,
                                    month,
                                    existing: p,
                                  })
                                }
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setUtilCellEdit({
                                    utility: u,
                                    month,
                                    existing: p ?? null,
                                  })
                                }
                                className={cn(
                                  "block h-full w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                                  isFuture && "opacity-50",
                                )}
                                title={`Log ${MONTHS[month - 1]} ${year} ${u.utility_name} bill`}
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
                              {cellCount} {cellCount === 1 ? "month" : "months"}
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
        )}
      </Card>

      {/* ── M-3b: Per-resident utility splits ───────────────────────
          Sits between the Utilities grid and the reconciliation strip
          so the page reads top-to-bottom: rent obligations → utility
          obligations → who-owes-what split → totals. */}
      {!isLoading && activeResidentCount > 0 && (utilities?.length ?? 0) > 0 ? (
        <UtilitySplitsPanel
          residents={residents ?? []}
          utilByUtility={utilByUtility}
          currentMonthIdx={currentMonthIdx}
        />
      ) : null}

      {/* ── Reconciliation strip — combined rent + utility ─────────── */}
      {!isLoading && ((rentGroups?.length ?? 0) > 0 || (utilities?.length ?? 0) > 0) ? (
        <ReconciliationStrip totals={totals} />
      ) : null}

      {/* R5 follow-up (Gus #8): House-only payment log. Lives here so
          household receipts stay separate from the Recast-business
          /payments page. */}
      {!isLoading ? <HousePaymentLogPanel year={year} /> : null}

      {/* Dialogs */}
      <ResidentDialog
        open={residentDialogOpen}
        onOpenChange={setResidentDialogOpen}
        resident={null}
      />
      <UtilityDialog
        open={utilityDialog.open}
        onOpenChange={(o) => setUtilityDialog({ open: o, utility: o ? utilityDialog.utility : null })}
        utility={utilityDialog.utility}
      />
      {rentCellEdit ? (
        <HouseCellDialog
          open
          onOpenChange={(o) => !o && setRentCellEdit(null)}
          year={year}
          month={rentCellEdit.month}
          mode={{
            kind: "rent",
            rentGroupId: rentCellEdit.group.id,
            groupLabel: rentCellEdit.group.label,
            defaultRent: Number(rentCellEdit.group.monthly_rent) || 0,
            existing: rentCellEdit.existing,
          }}
        />
      ) : null}
      {utilCellEdit ? (
        <HouseCellDialog
          open
          onOpenChange={(o) => !o && setUtilCellEdit(null)}
          year={year}
          month={utilCellEdit.month}
          mode={{
            kind: "utility",
            utilityId: utilCellEdit.utility.id,
            utilityName: utilCellEdit.utility.utility_name,
            activeResidentCount,
            existing: utilCellEdit.existing,
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared grid header — consistent month columns across rent + utility
// ─────────────────────────────────────────────────────────────────────

function GridHeader({
  currentMonthIdx,
  firstColLabel,
}: {
  currentMonthIdx: number | null;
  firstColLabel: string;
}) {
  return (
    <thead>
      <tr className="border-b border-rule">
        <th
          scope="col"
          className="sticky left-0 z-10 min-w-[200px] bg-[#0d0d0d] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel"
        >
          {firstColLabel}
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
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reconciliation strip — combined rent + utility totals
// ─────────────────────────────────────────────────────────────────────

function ReconciliationStrip({
  totals,
}: {
  totals: {
    rentBilled: number;
    rentPaid: number;
    utilBilled: number;
    utilPaid: number;
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
  };
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
      <RcCell
        label="Rent billed"
        value={formatUSD(totals.rentBilled, { decimals: 0 })}
        sub={`Paid ${formatUSD(totals.rentPaid, { decimals: 0 })}`}
      />
      <RcCell
        label="Utilities billed"
        value={formatUSD(totals.utilBilled, { decimals: 0 })}
        sub={`Paid ${formatUSD(totals.utilPaid, { decimals: 0 })}`}
      />
      <RcCell
        label="Total household"
        value={formatUSD(totals.totalBilled, { decimals: 0 })}
        sub={`Paid ${formatUSD(totals.totalPaid, { decimals: 0 })}`}
      />
      <RcCell
        label="Outstanding"
        value={formatUSD(totals.outstanding, { decimals: 0 })}
        sub="Rent + utilities unpaid"
        emphasised
        tone="electric"
      />
    </div>
  );
}

function RcCell({
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

// ─────────────────────────────────────────────────────────────────────
// Year selector chip — same as Vendors / Overview
// ─────────────────────────────────────────────────────────────────────

function YearChip({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
  return (
    <div className="relative inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[12px] text-white transition-colors duration-base ease-out focus-within:ring-1 focus-within:ring-electric">
      <Calendar className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      <span className="tabular">{value}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

// "Apr 04" — short "Mon DD" format used inside InvoiceCell ref slot.
function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
