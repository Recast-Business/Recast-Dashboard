import * as React from "react";
import { Download, Pencil, Plus, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteResident,
  useDeleteUtility,
  useHouseResidents,
  useHouseRentPayments,
  useHouseUtilities,
  useHouseUtilityPayments,
  useRentGroups,
} from "@/hooks/useHouse";
import { effectiveInvoiceStatus } from "@/lib/finance/invoiceStatus";
import { useConfirm } from "@/hooks/useConfirm";
import { ResidentDialog } from "@/components/finance/ResidentDialog";
import { UtilityDialog } from "@/components/finance/UtilityDialog";
import { HouseCellDialog } from "@/components/finance/HouseCellDialog";
import { LogReceiptDialog } from "@/components/finance/LogReceiptDialog";
import { HousePaymentEntryBox } from "@/components/finance/HousePaymentEntryBox";
import { HouseExportDialog } from "@/components/finance/HouseExportDialog";
// Phase M-4: panel exports replaced by the page-level filterable
// HouseExportDialog. ExportCSVButton / ExportPDFButton imports removed.
import type {
  HouseResident,
  HouseRentPayment,
  HouseUtility,
  HouseUtilityPayment,
  PaymentStatusV2,
  RentGroup,
} from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/30 text-muted-foreground",
  // Partial = half-green-paid / half-red-owed gradient. Looks like a split
  // cell so you immediately see "some has been paid, some still owed".
  partial: "bg-gradient-to-r from-emerald-100 from-50% to-rose-100 to-50% text-foreground",
  paid: "bg-emerald-50 text-emerald-900",
  overdue: "bg-rose-50 text-rose-900",
};

interface Props {
  year: number;
}

export function HouseSection({ year }: Props) {
  const { data: residents, isLoading: residentsLoading } = useHouseResidents();
  const { data: rentGroups, isLoading: rentGroupsLoading } = useRentGroups();
  const { data: utilities, isLoading: utilitiesLoading } = useHouseUtilities();
  const { data: rentByGroup } = useHouseRentPayments(year);
  const { data: utilityByUtility } = useHouseUtilityPayments(year);
  const [exportOpen, setExportOpen] = React.useState(false);

  const activeResidents = (residents ?? []).filter((r) => r.active);
  const activeResidentCount = activeResidents.length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4" /> {activeResidentCount} active resident
              {activeResidentCount === 1 ? "" : "s"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Frazier's house ledger. Rent is grouped — H&K pay together, others
              per resident. Utilities split equal-per-head across all active
              residents (so each resident is one head even when sharing a rent line).
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setExportOpen(true)}
            title="Export rent + utility statement, filterable per resident"
          >
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      <HouseExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        year={year}
        residents={residents ?? []}
        rentGroups={rentGroups ?? []}
        rentByGroup={rentByGroup ?? {}}
        utilities={utilities ?? []}
        utilityByUtility={utilityByUtility ?? {}}
      />

      {residentsLoading || utilitiesLoading || rentGroupsLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <BedroomsRentPanel
            year={year}
            rentGroups={rentGroups ?? []}
            residents={residents ?? []}
            rentByGroup={rentByGroup ?? {}}
          />
          {/* Phase M-3: central rent payment entry replaces per-row Pay buttons */}
          <HousePaymentEntryBox year={year} residents={activeResidents} />
          <UtilitiesPanel
            year={year}
            utilities={utilities ?? []}
            utilityByUtility={utilityByUtility ?? {}}
            activeResidentCount={activeResidentCount}
          />
          <PerResidentSplitPanel
            year={year}
            residents={activeResidents}
            utilityByUtility={utilityByUtility ?? {}}
            activeResidentCount={activeResidentCount}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bedrooms Rent — one row per resident × 12 month cells
// ─────────────────────────────────────────────────────────────────────

function BedroomsRentPanel({
  year,
  rentGroups,
  residents,
  rentByGroup,
}: {
  year: number;
  rentGroups: RentGroup[];
  residents: HouseResident[];
  rentByGroup: Record<string, Record<number, HouseRentPayment>>;
}) {
  const del = useDeleteResident();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingResident, setEditingResident] = React.useState<HouseResident | null>(null);
  const [editingCell, setEditingCell] = React.useState<{
    group: RentGroup;
    month: number;
  } | null>(null);

  // Group residents by rent_group_id so we can display "Harriet, Keenan" inline
  // for the H&K row, single name for solo groups.
  const residentsByGroup = React.useMemo(() => {
    const map: Record<string, HouseResident[]> = {};
    for (const r of residents) {
      if (!r.rent_group_id) continue;
      (map[r.rent_group_id] ??= []).push(r);
    }
    return map;
  }, [residents]);

  // Helper: derive a cell's effective status from amount_paid + period
  // EOM. Bruno: rent status is auto-derived; no manual flip. Receipts
  // logged via the Frazier's House payment box drive the pill colors.
  function deriveStatus(c: HouseRentPayment | undefined): PaymentStatusV2 {
    if (!c) return "unpaid";
    return effectiveInvoiceStatus({
      amount: Number(c.amount) || 0,
      amount_paid: Number(c.amount_paid) || 0,
      period_year: c.period_year,
      period_month: c.period_month,
    });
  }

  async function onDeleteResident(r: HouseResident) {
    const ok = await confirm({
      title: `Remove ${r.name}?`,
      description:
        "Removes the resident and their utility split history. Their rent group stays — adjust separately if needed.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(r.id);
      toast.success(`${r.name} removed`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  // Yearly totals — sum across paid cells in each rent group
  const totals = React.useMemo(() => {
    let totalRent = 0;
    let paidCount = 0;
    let totalCells = 0;
    for (const g of rentGroups) {
      const cells = rentByGroup[g.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        totalCells++;
        const c = cells[m];
        if (deriveStatus(c) === "paid") {
          paidCount++;
          totalRent += Number(c?.amount) || 0;
        }
      }
    }
    return { totalRent, paidCount, totalCells };
  }, [rentGroups, rentByGroup]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-h3">Bedrooms — Rent</h2>
          <p className="text-sm text-muted-foreground">
            Click any month cell to set the amount owed. Status pills auto-derive from the payment log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase M-4: panel-level CSV/PDF buttons removed. The single
              Export button at the top of the page opens a filterable
              dialog covering all sections. */}
          <Button
            size="sm"
            onClick={() => {
              setEditingResident(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add resident
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
              <TableHead className="sticky left-0 z-10 min-w-[200px] bg-muted/40">Group</TableHead>
              <TableHead className="min-w-[120px]">Bedroom</TableHead>
              <TableHead className="min-w-[90px]">Rent</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="min-w-[64px] text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead className="min-w-[80px] text-right">YTD</TableHead>
              <TableHead className="min-w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rentGroups.map((g) => {
              const cells = rentByGroup[g.id] ?? {};
              const groupResidents = residentsByGroup[g.id] ?? [];
              const isMultiResident = groupResidents.length > 1;
              const bedroomLabel = Array.from(
                new Set(groupResidents.map((r) => r.bedroom)),
              ).join(", ");
              // M-0 bug fix: YTD = paid only, so unselect subtracts.
              const ytd = Object.values(cells).reduce(
                (sum, p) =>
                  deriveStatus(p) === "paid" ? sum + (Number(p.amount) || 0) : sum,
                0,
              );
              return (
                <TableRow key={g.id} className="text-xs">
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <div className="font-medium">{g.label}</div>
                    {isMultiResident && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {groupResidents.map((r) => r.name).join(", ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{bedroomLabel || "—"}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatUSD(g.monthly_rent, { decimals: 2 })}
                  </TableCell>
                  {MONTHS.map((_label, i) => {
                    const month = i + 1;
                    const cell = cells[month];
                    const status = deriveStatus(cell);
                    const displayAmount = cell?.amount != null ? Number(cell.amount) : g.monthly_rent;
                    return (
                      <TableCell key={month} className="p-1">
                        <button
                          type="button"
                          onClick={() => setEditingCell({ group: g, month })}
                          title={`${formatUSD(displayAmount, { decimals: 2 })} · ${status} · click to edit`}
                          className={cn(
                            "block w-full rounded px-1 py-1.5 text-center font-semibold tabular-nums transition hover:ring-2 hover:ring-primary/40",
                            STATUS_STYLES[status],
                          )}
                        >
                          {formatUSDCompact(displayAmount)}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className="text-right font-semibold tabular-nums"
                    title={formatUSD(ytd, { decimals: 2 })}
                  >
                    {ytd > 0 ? formatUSD(ytd, { decimals: 2 }) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Phase M-3: per-row Pay button removed — central
                        Payment Entry Box below replaces it. Edit/Delete
                        operate on the first resident in the group; M-3
                        leaves this minimal until M-7 redoes the resident-
                        management UI. */}
                    {groupResidents[0] && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditingResident(groupResidents[0]);
                            setDialogOpen(true);
                          }}
                          title={`Edit ${groupResidents[0].name}'s details`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {!isMultiResident && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-1 h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onDeleteResident(groupResidents[0])}
                            title="Delete resident"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Phase M-3: total reconciliation row — sum of cell amounts per
                column should match the sum of rent_groups.monthly_rent.
                If they diverge it's a flag for Frazier to look into. */}
            {(() => {
              // Per-month totals across all groups
              const monthTotals: number[] = Array(12).fill(0);
              let totalAllRent = 0;
              for (const g of rentGroups) {
                totalAllRent += Number(g.monthly_rent) || 0;
                const cells = rentByGroup[g.id] ?? {};
                for (let m = 1; m <= 12; m++) {
                  const c = cells[m];
                  monthTotals[m - 1] += Number(c?.amount) || 0;
                }
              }
              const grandTotal = monthTotals.reduce((s, t) => s + t, 0);
              return (
                <TableRow className="bg-muted/30 text-xs font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-muted/30">TOTAL</TableCell>
                  <TableCell />
                  <TableCell className="font-mono tabular-nums">
                    {formatUSD(totalAllRent, { decimals: 2 })}
                  </TableCell>
                  {monthTotals.map((t, i) => (
                    <TableCell key={i} className="text-center tabular-nums">
                      {t > 0 ? formatUSD(t, { decimals: 0 }) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {grandTotal > 0 ? formatUSD(grandTotal, { decimals: 0 }) : "—"}
                  </TableCell>
                  <TableCell />
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        {totals.paidCount}/{totals.totalCells} rent payments collected · YTD paid:{" "}
        <span className="font-semibold tabular-nums text-foreground">
          {formatUSD(totals.totalRent, { decimals: 0 })}
        </span>
      </div>

      <ResidentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resident={editingResident}
      />

      {editingCell && (
        <HouseCellDialog
          open
          onOpenChange={(o) => !o && setEditingCell(null)}
          year={year}
          month={editingCell.month}
          mode={{
            kind: "rent",
            rentGroupId: editingCell.group.id,
            groupLabel: editingCell.group.label,
            defaultRent: editingCell.group.monthly_rent,
            existing: rentByGroup[editingCell.group.id]?.[editingCell.month] ?? null,
          }}
        />
      )}

      {/* Phase M-3: per-row LogReceiptDialog removed — central
          HousePaymentEntryBox below the rent table handles all rent
          receipts via FIFO. */}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Utilities — one row per utility × 12 month cells
// ─────────────────────────────────────────────────────────────────────

function UtilitiesPanel({
  year,
  utilities,
  utilityByUtility,
  activeResidentCount,
}: {
  year: number;
  utilities: HouseUtility[];
  utilityByUtility: Record<string, Record<number, HouseUtilityPayment>>;
  activeResidentCount: number;
}) {
  const del = useDeleteUtility();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingUtility, setEditingUtility] = React.useState<HouseUtility | null>(null);
  const [editingCell, setEditingCell] = React.useState<{
    utility: HouseUtility;
    month: number;
  } | null>(null);
  const [payTarget, setPayTarget] = React.useState<HouseUtility | null>(null);

  async function onDelete(u: HouseUtility) {
    const ok = await confirm({
      title: `Remove ${u.utility_name}?`,
      description: "Removes the utility and all monthly amounts for the year.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(u.id);
      toast.success(`${u.utility_name} removed`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  // Monthly totals across utilities — used by per-resident split panel below
  const monthlyTotals = React.useMemo(() => {
    const totals: number[] = Array(12).fill(0);
    for (const u of utilities) {
      const cells = utilityByUtility[u.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        totals[m - 1] += Number(cells[m]?.amount) || 0;
      }
    }
    return totals;
  }, [utilities, utilityByUtility]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-h3">Utilities</h2>
          <p className="text-sm text-muted-foreground">
            Click a month cell to enter the bill amount and status. Splits across {activeResidentCount}{" "}
            active resident{activeResidentCount === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase M-4: panel exports removed in favour of the page-level
              filterable Export button at the top of /finance → Frazier's House. */}
          <Button
            size="sm"
            onClick={() => {
              setEditingUtility(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add utility
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
              <TableHead className="sticky left-0 z-10 min-w-[200px] bg-muted/40">Utility</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="min-w-[64px] text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead className="min-w-[80px] text-right">YTD</TableHead>
              <TableHead className="min-w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {utilities.map((u) => {
              const cells = utilityByUtility[u.id] ?? {};
              const ytd = Object.values(cells).reduce(
                (sum, p) => sum + (Number(p.amount) || 0),
                0,
              );
              return (
                <TableRow key={u.id} className="text-xs">
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    {u.utility_name}
                    {!u.active && <span className="ml-2 text-[10px] text-muted-foreground">inactive</span>}
                  </TableCell>
                  {MONTHS.map((_label, i) => {
                    const month = i + 1;
                    const cell = cells[month];
                    const status: PaymentStatusV2 = cell
                      ? effectiveInvoiceStatus({
                          amount: Number(cell.amount) || 0,
                          amount_paid: Number(cell.amount_paid) || 0,
                          period_year: cell.period_year,
                          period_month: cell.period_month,
                        })
                      : "unpaid";
                    return (
                      <TableCell key={month} className="p-1">
                        <button
                          type="button"
                          onClick={() => setEditingCell({ utility: u, month })}
                          title={
                            cell?.amount != null
                              ? `${formatUSD(cell.amount, { decimals: 2 })}`
                              : "Click to enter bill amount"
                          }
                          className={cn(
                            "block w-full rounded px-1 py-1.5 text-center font-semibold tabular-nums transition hover:ring-2 hover:ring-primary/40",
                            STATUS_STYLES[status],
                          )}
                        >
                          {cell?.amount != null && Number(cell.amount) > 0
                            ? formatUSDCompact(Number(cell.amount))
                            : "—"}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className="text-right font-semibold tabular-nums"
                    title={formatUSD(ytd, { decimals: 2 })}
                  >
                    {ytd > 0 ? formatUSD(ytd, { decimals: 2 }) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPayTarget(u)}
                      title="Log a utility payment (FIFO across oldest unpaid months)"
                    >
                      <Wallet className="mr-1 h-3 w-3" /> Pay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-1 h-7 w-7 p-0"
                      onClick={() => {
                        setEditingUtility(u);
                        setDialogOpen(true);
                      }}
                      title="Edit utility"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-1 h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(u)}
                      title="Delete utility"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Total row */}
            <TableRow className="bg-muted/30 text-xs font-semibold">
              <TableCell className="sticky left-0 z-10 bg-muted/30">TOTAL</TableCell>
              {monthlyTotals.map((t, i) => (
                <TableCell key={i} className="text-center tabular-nums">
                  {t > 0 ? formatUSD(t, { decimals: 2 }) : "—"}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">
                {monthlyTotals.reduce((s, t) => s + t, 0) > 0
                  ? formatUSD(monthlyTotals.reduce((s, t) => s + t, 0), { decimals: 2 })
                  : "—"}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <UtilityDialog open={dialogOpen} onOpenChange={setDialogOpen} utility={editingUtility} />

      {editingCell && (
        <HouseCellDialog
          open
          onOpenChange={(o) => !o && setEditingCell(null)}
          year={year}
          month={editingCell.month}
          mode={{
            kind: "utility",
            utilityId: editingCell.utility.id,
            utilityName: editingCell.utility.utility_name,
            activeResidentCount,
            existing: utilityByUtility[editingCell.utility.id]?.[editingCell.month] ?? null,
          }}
        />
      )}

      {payTarget && (
        <LogReceiptDialog
          open
          onOpenChange={(o) => !o && setPayTarget(null)}
          mode={{
            kind: "house_utility",
            utilityId: payTarget.id,
            utilityName: payTarget.utility_name,
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-resident split — computed view (utilities total ÷ N active residents)
// ─────────────────────────────────────────────────────────────────────

function PerResidentSplitPanel({
  residents,
  utilityByUtility,
  activeResidentCount,
}: {
  year: number;
  residents: HouseResident[];
  utilityByUtility: Record<string, Record<number, HouseUtilityPayment>>;
  activeResidentCount: number;
}) {
  if (activeResidentCount === 0) {
    return (
      <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        Add an active resident to compute the per-head utility split.
      </div>
    );
  }

  // Compute the monthly TOTAL across all utilities, then split per-resident
  // with Frazier-takes-the-extra-cents rounding so the splits always reconcile.
  const monthlyTotals: number[] = Array(12).fill(0);
  for (const utilityId of Object.keys(utilityByUtility)) {
    for (let m = 1; m <= 12; m++) {
      monthlyTotals[m - 1] += Number(utilityByUtility[utilityId]?.[m]?.amount) || 0;
    }
  }

  // Find Frazier in the resident list (by name match). Falls back to first
  // resident if not found, so the algorithm always reconciles.
  const frazierIdx = Math.max(
    0,
    residents.findIndex((r) => r.name.toLowerCase().includes("frazier")),
  );

  // Per-resident per-month share — floor for everyone, Frazier absorbs the
  // remainder so the column sums to the original total exactly.
  function shareFor(residentIdx: number, monthIdx: number): number {
    const total = monthlyTotals[monthIdx];
    if (total <= 0 || activeResidentCount === 0) return 0;
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / activeResidentCount);
    const remainderCents = totalCents - baseCents * activeResidentCount;
    if (residentIdx === frazierIdx) {
      return (baseCents + remainderCents) / 100;
    }
    return baseCents / 100;
  }

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-h3">All Splits — Utilities per resident</h2>
        <p className="text-sm text-muted-foreground">
          Equal-per-head split of monthly utility bills. Cent remainders go to Frazier so each
          column reconciles to the utility total exactly.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
              <TableHead className="sticky left-0 z-10 min-w-[200px] bg-muted/40">Resident</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="min-w-[72px] text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead className="min-w-[90px] text-right">YTD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {residents.map((r, rIdx) => {
              const yearlyShare = monthlyTotals.reduce(
                (sum, _t, mIdx) => sum + shareFor(rIdx, mIdx),
                0,
              );
              return (
                <TableRow key={r.id} className="text-xs">
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    {r.name}
                  </TableCell>
                  {monthlyTotals.map((_t, mIdx) => {
                    const share = shareFor(rIdx, mIdx);
                    return (
                      <TableCell
                        key={mIdx}
                        className="text-center font-semibold tabular-nums"
                        title={share > 0 ? formatUSD(share, { decimals: 2 }) : undefined}
                      >
                        {share > 0 ? formatUSD(share, { decimals: 2 }) : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {yearlyShare > 0 ? formatUSD(yearlyShare, { decimals: 2 }) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Phase M-3: TOTAL row — column sums must match the utility
                bill totals (cent-rounding sends remainders to Frazier,
                so each column reconciles exactly). */}
            <TableRow className="bg-muted/30 text-xs font-semibold">
              <TableCell className="sticky left-0 z-10 bg-muted/30">TOTAL</TableCell>
              {monthlyTotals.map((t, mIdx) => (
                <TableCell key={mIdx} className="text-center tabular-nums">
                  {t > 0 ? formatUSD(t, { decimals: 2 }) : "—"}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">
                {monthlyTotals.reduce((s, t) => s + t, 0) > 0
                  ? formatUSD(monthlyTotals.reduce((s, t) => s + t, 0), { decimals: 2 })
                  : "—"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Phase M-4: per-panel CSV column builders removed. The page-level
// HouseExportDialog uses lib/export/houseStatement.ts which builds
// statement-style PDFs / CSVs directly from raw data.
