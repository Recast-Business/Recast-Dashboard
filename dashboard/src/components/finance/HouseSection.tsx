import * as React from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
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
  useUpsertRentPayment,
} from "@/hooks/useHouse";
import { useConfirm } from "@/hooks/useConfirm";
import { ResidentDialog } from "@/components/finance/ResidentDialog";
import { UtilityDialog } from "@/components/finance/UtilityDialog";
import { HouseCellDialog } from "@/components/finance/HouseCellDialog";
import type {
  HouseResident,
  HouseRentPayment,
  HouseUtility,
  HouseUtilityPayment,
  PaymentStatusV2,
} from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/30 text-muted-foreground",
  partial: "bg-amber-50 text-amber-900",
  paid: "bg-emerald-50 text-emerald-900",
  overdue: "bg-rose-50 text-rose-900",
};

interface Props {
  year: number;
}

export function HouseSection({ year }: Props) {
  const { data: residents, isLoading: residentsLoading } = useHouseResidents();
  const { data: utilities, isLoading: utilitiesLoading } = useHouseUtilities();
  const { data: rentByResident } = useHouseRentPayments(year);
  const { data: utilityByUtility } = useHouseUtilityPayments(year);

  const activeResidentCount = (residents ?? []).filter((r) => r.active).length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Users className="h-4 w-4" /> {activeResidentCount} active resident{activeResidentCount === 1 ? "" : "s"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Frazier's house ledger. Bedroom rent is paid per resident. Utility bills are
          split equal-per-head across active residents — those splits show in the bottom panel.
        </p>
      </div>

      {residentsLoading || utilitiesLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <BedroomsRentPanel
            year={year}
            residents={residents ?? []}
            rentByResident={rentByResident ?? {}}
          />
          <UtilitiesPanel
            year={year}
            utilities={utilities ?? []}
            utilityByUtility={utilityByUtility ?? {}}
            activeResidentCount={activeResidentCount}
          />
          <PerResidentSplitPanel
            year={year}
            residents={(residents ?? []).filter((r) => r.active)}
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
  residents,
  rentByResident,
}: {
  year: number;
  residents: HouseResident[];
  rentByResident: Record<string, Record<number, HouseRentPayment>>;
}) {
  const upsert = useUpsertRentPayment();
  const del = useDeleteResident();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingResident, setEditingResident] = React.useState<HouseResident | null>(null);
  const [editingCell, setEditingCell] = React.useState<{
    resident: HouseResident;
    month: number;
  } | null>(null);

  async function quickToggleRent(r: HouseResident, month: number, current?: HouseRentPayment) {
    const nextStatus: PaymentStatusV2 =
      !current || current.status === "unpaid" ? "paid" : "unpaid";
    try {
      await upsert.mutateAsync({
        resident_id: r.id,
        period_year: year,
        period_month: month,
        amount: current?.amount ?? r.monthly_rent,
        status: nextStatus,
        paid_at: nextStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
        notes: current?.notes ?? null,
      });
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`);
    }
  }

  async function onDelete(r: HouseResident) {
    const ok = await confirm({
      title: `Remove ${r.name}?`,
      description:
        "Removes the resident and all their rent payment history for the year. Set them to inactive instead if they're just moving out.",
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

  // Yearly totals
  const totals = React.useMemo(() => {
    let totalRent = 0;
    let paidCount = 0;
    let totalCells = 0;
    for (const r of residents) {
      const cells = rentByResident[r.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        totalCells++;
        const c = cells[m];
        if (c?.status === "paid") {
          paidCount++;
          totalRent += Number(c.amount) || 0;
        }
      }
    }
    return { totalRent, paidCount, totalCells };
  }, [residents, rentByResident]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bedrooms — Rent</h2>
          <p className="text-sm text-muted-foreground">
            Click any month cell to toggle paid · Right-click for amount/notes/date.
          </p>
        </div>
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

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
              <TableHead className="sticky left-0 z-10 min-w-[180px] bg-muted/40">Resident</TableHead>
              <TableHead className="min-w-[120px]">Bedroom</TableHead>
              <TableHead className="min-w-[90px]">Rent</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="min-w-[64px] text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead className="min-w-[70px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {residents.map((r) => {
              const cells = rentByResident[r.id] ?? {};
              return (
                <TableRow key={r.id} className="text-xs">
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    {r.name}
                    {!r.active && <span className="ml-2 text-[10px] text-muted-foreground">inactive</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.bedroom}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatUSD(r.monthly_rent, { decimals: 0 })}
                  </TableCell>
                  {MONTHS.map((_label, i) => {
                    const month = i + 1;
                    const cell = cells[month];
                    const status = cell?.status ?? "unpaid";
                    // Always show the expected rent amount up-front. Cell colour
                    // indicates whether it's been paid yet (or is overdue/partial).
                    const displayAmount = cell?.amount != null ? Number(cell.amount) : r.monthly_rent;
                    return (
                      <TableCell key={month} className="p-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (e.shiftKey || e.metaKey || e.ctrlKey) {
                              setEditingCell({ resident: r, month });
                            } else {
                              quickToggleRent(r, month, cell);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setEditingCell({ resident: r, month });
                          }}
                          title={`${formatUSD(displayAmount, { decimals: 2 })} · ${status} · click to toggle, right-click for full edit`}
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
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setEditingResident(r);
                        setDialogOpen(true);
                      }}
                      title="Edit resident"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => onDelete(r)}
                      title="Delete resident"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
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
            residentId: editingCell.resident.id,
            residentName: editingCell.resident.name,
            defaultRent: editingCell.resident.monthly_rent,
            existing: rentByResident[editingCell.resident.id]?.[editingCell.month] ?? null,
          }}
        />
      )}
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
          <h2 className="text-lg font-semibold">Utilities</h2>
          <p className="text-sm text-muted-foreground">
            Click a month cell to enter the bill amount and status. Splits across {activeResidentCount}{" "}
            active resident{activeResidentCount === 1 ? "" : "s"}.
          </p>
        </div>
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
              <TableHead className="min-w-[70px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {utilities.map((u) => {
              const cells = utilityByUtility[u.id] ?? {};
              return (
                <TableRow key={u.id} className="text-xs">
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    {u.utility_name}
                    {!u.active && <span className="ml-2 text-[10px] text-muted-foreground">inactive</span>}
                  </TableCell>
                  {MONTHS.map((_label, i) => {
                    const month = i + 1;
                    const cell = cells[month];
                    const status = cell?.status ?? "unpaid";
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
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
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
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
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
                  {t > 0 ? formatUSDCompact(t) : "—"}
                </TableCell>
              ))}
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
  const monthlyShare = React.useMemo(() => {
    const totals: number[] = Array(12).fill(0);
    for (const utilityId of Object.keys(utilityByUtility)) {
      for (let m = 1; m <= 12; m++) {
        totals[m - 1] += Number(utilityByUtility[utilityId]?.[m]?.amount) || 0;
      }
    }
    if (activeResidentCount === 0) return totals.map(() => 0);
    return totals.map((t) => t / activeResidentCount);
  }, [utilityByUtility, activeResidentCount]);

  const yearlyShare = monthlyShare.reduce((a, b) => a + b, 0);

  if (activeResidentCount === 0) {
    return (
      <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        Add an active resident to compute the per-head utility split.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold">All Splits — Utilities per resident</h2>
        <p className="text-sm text-muted-foreground">
          Equal-per-head split of monthly utility bills. Each active resident owes the same amount.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
              <TableHead className="sticky left-0 z-10 min-w-[200px] bg-muted/40">Resident</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="min-w-[64px] text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead className="min-w-[80px] text-right">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {residents.map((r) => (
              <TableRow key={r.id} className="text-xs">
                <TableCell className="sticky left-0 z-10 bg-background font-medium">{r.name}</TableCell>
                {monthlyShare.map((share, i) => (
                  <TableCell key={i} className="text-center font-semibold tabular-nums">
                    {share > 0 ? formatUSDCompact(share) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatUSD(yearlyShare, { decimals: 0 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
