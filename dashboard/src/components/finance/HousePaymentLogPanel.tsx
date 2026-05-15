import * as React from "react";
import { Home, Pencil, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EyebrowLabel, MoneyCell } from "@/components/recast";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import {
  useDeleteReceipt,
  useHouseAllReceipts,
} from "@/hooks/usePaymentReceipts";
import { EditReceiptDialog } from "@/components/finance/EditReceiptDialog";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/auth/AuthProvider";
import type { PaymentMethod } from "@/types/finance";
import { cn, formatDate, formatUSD } from "@/lib/utils";

/**
 * R5 follow-up (Gus #8) — Frazier's House payment log.
 *
 * Shows every house_rent + house_utility receipt for the year. Lives
 * on /house under the rent + utility grids so the household ledger is
 * self-contained. The global /payments page no longer surfaces house
 * sources (filtered out in src/pages/Payments.tsx).
 *
 * Columns:
 *   Date | Source chip | Payee/Utility | Amount | Method | Reference | Allocations
 *
 * Allocations summary mirrors the global Payments log — uses month
 * abbreviations and collapses to "N months" once it exceeds two
 * periods so the row stays compact.
 */

interface ReceiptRow {
  id: string;
  source: "house_rent" | "house_utility";
  received_at: string;
  amount: number;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  resident: { id: string; name: string } | null;
  utility: { id: string; utility_name: string } | null;
  allocations: { period_year: number; period_month: number; amount: number }[];
}

interface Props {
  year: number;
}

const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function HousePaymentLogPanel({ year }: Props) {
  // R5 follow-up (roles audit): partner sees the log read-only.
  // Edit/Delete icons + EditReceiptDialog are gated by canWrite.
  const { role } = useAuth();
  const canWrite = role === "admin" || role === "finance";

  const { data, isLoading } = useHouseAllReceipts(year);
  const del = useDeleteReceipt();
  const confirm = useConfirm();
  const [editingRow, setEditingRow] = React.useState<ReceiptRow | null>(null);

  const rows = (data ?? []) as ReceiptRow[];

  async function onDelete(row: ReceiptRow) {
    const payee = row.source === "house_rent"
      ? row.resident?.name ?? "(unknown resident)"
      : row.utility?.utility_name ?? "(unknown utility)";
    const ok = await confirm({
      title: `Delete this receipt?`,
      description: (
        <>
          {formatUSD(Number(row.amount) || 0, { decimals: 2 })} for{" "}
          <strong>{payee}</strong> on {formatDate(row.received_at)}. The
          allocations roll back automatically so the rent / utility
          row&apos;s amount_paid and status update on their own.
        </>
      ),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync({ id: row.id, source: row.source });
      toast.success("Receipt deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  const totals = React.useMemo(() => {
    let total = 0;
    let rent = 0;
    let utility = 0;
    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      total += amt;
      if (r.source === "house_rent") rent += amt;
      else utility += amt;
    }
    return { total, rent, utility };
  }, [rows]);

  const csvRows = React.useMemo(
    () =>
      rows.map((r) => ({
        date: r.received_at,
        source: r.source === "house_rent" ? "Rent" : "Utility",
        payee:
          r.source === "house_rent"
            ? r.resident?.name ?? "(unknown resident)"
            : r.utility?.utility_name ?? "(unknown utility)",
        amount: String(Number(r.amount) || 0),
        method: r.method ?? "",
        reference: r.reference ?? "",
        allocations: r.allocations
          .map(
            (a) =>
              `${a.period_year}-${String(a.period_month).padStart(2, "0")}: ${a.amount}`,
          )
          .join(" | "),
        notes: r.notes ?? "",
      })),
    [rows],
  );

  return (
    // R5 follow-up (Gus): panel now wrapped in a Card matching the
    // rest of the /house sections (UtilitySplitsPanel etc.). Header
    // sits in a bordered top region so it doesn't slam into the
    // reconciliation strip above. Stats line below the header gets
    // its own section divider. Plenty of breathing room — the prior
    // bare-div version felt claustrophobic next to the strip.
    <Card className="overflow-hidden p-0">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-tile-md py-tile-md">
        <div>
          <EyebrowLabel withRule>Payment log · {year}</EyebrowLabel>
          <h2 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
            House receipts
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-[13px] text-steel">
            Every rent + utility receipt logged for Frazier&apos;s House
            this year. Separated from the global Recast payment log so
            household reconciliation stays focused.
          </p>
        </div>
        <ExportCSVButton
          filename={`recast-house-receipts-${year}.csv`}
          rows={csvRows}
          label="Export CSV"
          disabled={csvRows.length === 0}
          columns={[
            { header: "Date", value: (r) => r.date },
            { header: "Source", value: (r) => r.source },
            { header: "Payee", value: (r) => r.payee },
            { header: "Amount", value: (r) => r.amount },
            { header: "Method", value: (r) => r.method },
            { header: "Reference", value: (r) => r.reference },
            { header: "Allocations", value: (r) => r.allocations },
            { header: "Notes", value: (r) => r.notes },
          ]}
        />
      </div>

      {/* ── Totals strip ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-[#0d0d0d] px-tile-md py-2.5 text-[12px] text-steel">
        <span>
          {rows.length} receipt{rows.length === 1 ? "" : "s"}
        </span>
        <span className="text-rule">·</span>
        <span>
          Total{" "}
          <span className="tabular font-semibold text-white">
            {formatUSD(totals.total, { decimals: 2 })}
          </span>
        </span>
        <span className="text-rule">·</span>
        <span>
          Rent{" "}
          <span className="tabular text-paid">
            {formatUSD(totals.rent, { decimals: 2 })}
          </span>
        </span>
        <span className="text-rule">·</span>
        <span>
          Utility{" "}
          <span className="tabular text-electric">
            {formatUSD(totals.utility, { decimals: 2 })}
          </span>
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="p-tile-md">
          <Skeleton className="h-[200px] w-full rounded-md" />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-tile-md py-10 text-center text-[13px] text-steel">
          No house receipts logged for {year} yet. Log one above via the
          combined-payment box and it&apos;ll appear here.
        </div>
      ) : (
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <Th>Date</Th>
                  <Th>Source</Th>
                  <Th>Payee / Utility</Th>
                  <Th right>Amount</Th>
                  <Th>Method</Th>
                  <Th>Reference</Th>
                  <Th>Allocations</Th>
                  {canWrite ? <Th right>Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ReceiptRowView
                    key={r.id}
                    row={r}
                    canWrite={canWrite}
                    onEdit={() => setEditingRow(r)}
                    onDelete={() => onDelete(r)}
                    deleting={del.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* R5 follow-up — edit dialog driven by the row pencil button.
          Mounts always; receipt=null while closed. */}
      <EditReceiptDialog
        open={editingRow != null}
        onOpenChange={(o) => {
          if (!o) setEditingRow(null);
        }}
        receipt={
          editingRow
            ? {
                id: editingRow.id,
                source: editingRow.source,
                received_at: editingRow.received_at,
                amount: editingRow.amount,
                method: editingRow.method,
                reference: editingRow.reference,
                notes: editingRow.notes,
                display_name:
                  editingRow.source === "house_rent"
                    ? `Rent · ${editingRow.resident?.name ?? "(unknown)"}`
                    : `Utility · ${editingRow.utility?.utility_name ?? "(unknown)"}`,
              }
            : null
        }
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────

function ReceiptRowView({
  row,
  canWrite,
  onEdit,
  onDelete,
  deleting,
}: {
  row: ReceiptRow;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const isRent = row.source === "house_rent";
  const Icon = isRent ? Home : Zap;
  const payee = isRent
    ? row.resident?.name ?? "(unknown resident)"
    : row.utility?.utility_name ?? "(unknown utility)";
  return (
    <tr className="group border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]">
      <td className="px-3 py-2.5 align-top text-[12px] tabular text-white">
        {formatDate(row.received_at)}
      </td>
      <td className="px-3 py-2.5 align-top">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
            isRent ? "bg-paid-tint text-paid" : "bg-electric/10 text-electric",
          )}
        >
          <Icon className="h-2.5 w-2.5" strokeWidth={2} />
          {isRent ? "Rent" : "Utility"}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-white">{payee}</td>
      <td className="px-3 py-2.5 text-right align-top">
        <MoneyCell amount={Number(row.amount) || 0} size="body" splitDecimals={false} />
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-steel">
        {row.method ?? "—"}
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-steel">
        <div className="max-w-[180px] truncate" title={row.reference ?? ""}>
          {row.reference ?? "—"}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-steel">
        {summariseAllocations(row.allocations)}
      </td>
      {/* R5 follow-up (Gus): per-row edit + delete. Icons stay quiet
          until row hover so the table doesn't get visually noisy.
          R5 follow-up (roles audit): the whole column is omitted for
          partner — write actions hidden + the table header drops the
          Actions <Th> entirely so the layout stays clean. */}
      {canWrite ? (
        <td className="px-3 py-2.5 text-right align-top">
          <div className="inline-flex items-center gap-0.5 opacity-0 transition-opacity duration-base ease-out group-hover:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              title="Edit receipt"
              aria-label="Edit receipt"
              className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              title="Delete receipt"
              aria-label="Delete receipt"
              className="rounded-sm border border-rule p-1 text-steel transition-colors duration-base ease-out hover:border-overdue/40 hover:bg-overdue/10 hover:text-overdue disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function summariseAllocations(
  list: { period_year: number; period_month: number; amount: number }[],
): string {
  if (list.length === 0) return "unallocated";
  if (list.length === 1) {
    const x = list[0];
    return `${MONTH_ABBREV[Math.max(0, Math.min(11, x.period_month - 1))]} ${x.period_year}`;
  }
  if (list.length === 2) {
    const [x, y] = list;
    if (x.period_year === y.period_year) {
      return `${MONTH_ABBREV[x.period_month - 1]} + ${MONTH_ABBREV[y.period_month - 1]} ${x.period_year}`;
    }
    return `${MONTH_ABBREV[x.period_month - 1]} ${x.period_year} + ${MONTH_ABBREV[y.period_month - 1]} ${y.period_year}`;
  }
  return `${list.length} months`;
}

// ─────────────────────────────────────────────────────────────────────
// Local primitive
// ─────────────────────────────────────────────────────────────────────

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-steel",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

