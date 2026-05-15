import * as React from "react";
import { Home, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EyebrowLabel, MoneyCell } from "@/components/recast";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { useHouseAllReceipts } from "@/hooks/usePaymentReceipts";
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
  method: string | null;
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
  const { data, isLoading } = useHouseAllReceipts(year);
  const rows = (data ?? []) as ReceiptRow[];

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <EyebrowLabel withRule>Payment log · {year}</EyebrowLabel>
          <h2 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
            House receipts
          </h2>
          <p className="mt-1 max-w-[60ch] text-[13px] text-steel">
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

      {/* Totals summary line — quick reconciliation across rent +
          utilities for the year. */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-[12px] text-steel">
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

      {isLoading ? (
        <Skeleton className="h-[200px] w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          No house receipts logged for {year} yet. Log one above via the
          combined-payment box and it&apos;ll appear here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
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
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ReceiptRowView key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────

function ReceiptRowView({ row }: { row: ReceiptRow }) {
  const isRent = row.source === "house_rent";
  const Icon = isRent ? Home : Zap;
  const payee = isRent
    ? row.resident?.name ?? "(unknown resident)"
    : row.utility?.utility_name ?? "(unknown utility)";
  return (
    <tr className="border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]">
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

