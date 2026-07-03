import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  IdCard,
  Pencil,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EyebrowLabel, MetricStrip, MoneyCell, Sparkline } from "@/components/recast";
import { useCreators } from "@/hooks/useCreators";
import { useCreatorPerformance } from "@/hooks/useCreatorPerformance";
import { useSharedYear } from "@/hooks/useSharedYear";
import { NewTaskButton } from "@/components/tasks/NewTaskButton";
import { CreatorProfileDialog } from "@/components/roster/CreatorProfileDialog";
import { useAuth } from "@/auth/AuthProvider";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Round 4 C — per-creator P&L detail page.
 *
 * Route: /talents/:id. Admin + finance only (matches /talents page
 * gating — both surface the same sensitive financial data).
 *
 * Composition:
 *   • Header: name, kind, back-link to /talents, Edit button
 *     (opens existing CreatorProfileDialog).
 *   • View toggle: Lifetime vs year-specific. Year selector activates
 *     when "Year" is chosen.
 *   • KPI strip (4 tiles): Gross, Recast commission, Creator take-home,
 *     On-time payment rate.
 *   • Per-platform rollup (3 cards): OnlyFans, Telegram, Ad Overlay.
 *   • Monthly trend sparkline.
 *   • Recent invoices list (last 10, scoped to current view).
 *   • Tax-tracker callout (only when requires_tax_info=true).
 *
 * All numbers are computed by useCreatorPerformance which scopes the
 * underlying queries by year when year is set.
 */

export function TalentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "accounting";

  // Read the creator list once for the profile object (cheap — already
  // cached on /talents for the row that linked here).
  const { data: creators } = useCreators("signed");
  const creator = (creators ?? []).find((c) => c.id === id);

  const [mode, setMode] = React.useState<"lifetime" | "year">("year");
  // Round-1 efficiency: year pick persists across pages/sessions.
  const [year, setYear] = useSharedYear();
  const effectiveYear = mode === "lifetime" ? null : year;

  const { data: perf, isLoading } = useCreatorPerformance(id, effectiveYear);

  const [editing, setEditing] = React.useState(false);

  if (!creator && !isLoading) {
    return (
      <div className="space-y-4">
        <Link
          to="/talents"
          className="inline-flex items-center gap-1 text-[12px] text-steel hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Back to Talents
        </Link>
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          Creator not found — they may have been unsigned or removed.
        </div>
      </div>
    );
  }

  const c = creator;

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/talents")}
          className="inline-flex items-center gap-1 text-[12px] text-steel transition-colors duration-base ease-out hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Back to Talents
        </button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <EyebrowLabel withRule>Talent · P&amp;L</EyebrowLabel>
            <h1 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
              {c?.name ?? "Loading…"}
            </h1>
            {c ? (
              <p className="mt-1 flex items-center gap-2 text-[12px] text-steel">
                <IdCard className="h-3.5 w-3.5" strokeWidth={1.5} />
                {c.category ?? "—"}
                {c.country ? ` · ${c.country}` : ""}
                {c.signed ? (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-sm bg-paid-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paid">
                    <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2} />
                    Signed
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {/* Round 3: quick-add a task linked to this creator. */}
            {c ? (
              <NewTaskButton entity={{ type: "creator", id: c.id, label: c.name }} />
            ) : null}
            <ViewSwitch mode={mode} onMode={setMode} year={year} onYear={setYear} />
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="h-8 text-[12px]"
              >
                <Pencil className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Edit profile
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────── */}
      {isLoading || !perf ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[112px] rounded-lg" />
          ))}
        </div>
      ) : (
        <MetricStrip
          tiles={[
            {
              label: "Gross billed",
              value: formatUSD(perf.totalGross, { decimals: 0 }),
              sub: periodLabel(perf, mode, year),
              icon: TrendingUp,
            },
            {
              label: "Recast commission",
              value: formatUSD(perf.totalRecast, { decimals: 0 }),
              sub:
                perf.totalGross > 0
                  ? `${((perf.totalRecast / perf.totalGross) * 100).toFixed(1)}% effective`
                  : "—",
              icon: CircleDollarSign,
              tone: "paid",
            },
            {
              label: "Creator take-home",
              value: formatUSD(perf.totalTakeHome, { decimals: 0 }),
              sub: `Net to ${c?.name ?? "creator"}`,
              icon: Sparkles,
            },
            {
              label: "On-time invoices",
              value:
                perf.invoiceOnTimeRate == null
                  ? "—"
                  : `${Math.round(perf.invoiceOnTimeRate * 100)}%`,
              sub:
                perf.invoicePaidCount === 0
                  ? "No paid invoices yet"
                  : `${perf.invoiceOnTimeCount} of ${perf.invoicePaidCount} paid before due`,
              icon: CalendarDays,
              tone:
                perf.invoiceOnTimeRate == null
                  ? "default"
                  : perf.invoiceOnTimeRate >= 0.85
                    ? "paid"
                    : perf.invoiceOnTimeRate >= 0.6
                      ? "partial"
                      : "overdue",
            },
          ]}
        />
      )}

      {/* ── Per-platform breakdown ───────────────────────────────────── */}
      {isLoading || !perf ? (
        <Skeleton className="h-[180px] w-full rounded-lg" />
      ) : (
        <div>
          <EyebrowLabel withRule>Platform breakdown</EyebrowLabel>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            <PlatformCard label="OnlyFans" summary={perf.of} />
            <PlatformCard label="Telegram" summary={perf.telegram} />
            <PlatformCard label="Ad Overlay" summary={perf.overlay} />
          </div>
        </div>
      )}

      {/* ── Monthly trend ────────────────────────────────────────────── */}
      {!isLoading && perf && perf.monthlyTrend.length > 0 ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <EyebrowLabel withRule>Monthly gross</EyebrowLabel>
              <p className="mt-1 text-[12px] text-steel">
                {perf.monthlyTrend.length} month
                {perf.monthlyTrend.length === 1 ? "" : "s"} of data ·{" "}
                {firstMonth(perf.monthlyTrend)} → {lastMonth(perf.monthlyTrend)}
              </p>
            </div>
            <div className="text-right">
              <div className="tabular font-display text-h2 font-bold leading-none text-white">
                {formatUSD(maxMonth(perf.monthlyTrend), { decimals: 0 })}
              </div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-steel">
                Peak month
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Sparkline
              values={perf.monthlyTrend.map((p) => p.gross)}
              tone="electric"
              width={640}
              height={64}
              className="w-full"
            />
          </div>
        </div>
      ) : null}

      {/* ── Tax tracker callout ──────────────────────────────────────── */}
      {c?.requires_tax_info ? (
        <div className="rounded-lg border border-electric/40 bg-electric/[0.05] p-4">
          <div className="flex items-start gap-3">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-white">
                Tagged for 1099 tracking
              </div>
              <p className="mt-1 max-w-[80ch] text-[12px] text-steel">
                W9 {c.w9_received_at ? "received" : "not yet received"}
                {c.w9_url ? " · link on file" : ""}. Year-end 1099 status
                and amount reported live on the dedicated tax page.
              </p>
            </div>
            <Link
              to="/tax"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-electric hover:underline"
            >
              Open Tax Tracker <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Recent invoices ──────────────────────────────────────────── */}
      <div>
        <EyebrowLabel withRule>Recent invoices · {periodLabel(perf, mode, year)}</EyebrowLabel>
        {isLoading || !perf ? (
          <Skeleton className="mt-2 h-[180px] w-full rounded-lg" />
        ) : perf.recentInvoices.length === 0 ? (
          <div className="mt-2 rounded-lg border bg-card p-6 text-center text-[13px] text-steel">
            No invoices logged for this view.
          </div>
        ) : (
          <div className="mt-2 overflow-hidden rounded-lg border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <Th>Period</Th>
                  <Th>Invoice #</Th>
                  <Th right>Amount</Th>
                  <Th>Status</Th>
                  <Th>Due</Th>
                  <Th>Paid</Th>
                </tr>
              </thead>
              <tbody>
                {perf.recentInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-2 text-[12px] text-white">
                      {MONTH_ABBR[inv.period_month - 1]} {inv.period_year}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-steel">
                      {inv.invoice_number ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyCell
                        amount={Number(inv.amount) || 0}
                        size="body"
                        splitDecimals={false}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="px-3 py-2 text-[12px] text-steel">
                      {inv.due_date}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-steel">
                      {inv.paid_at ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile editor */}
      {editing && c ? (
        <CreatorProfileDialog
          open
          onOpenChange={(o) => !o && setEditing(false)}
          creator={c as unknown as React.ComponentProps<typeof CreatorProfileDialog>["creator"]}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function periodLabel(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _perf: unknown,
  mode: "lifetime" | "year",
  year: number,
): string {
  if (mode === "lifetime") return "Lifetime";
  return String(year);
}

function firstMonth(trend: { ym: string }[]): string {
  if (trend.length === 0) return "—";
  const [y, m] = trend[0].ym.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${y}`;
}
function lastMonth(trend: { ym: string }[]): string {
  if (trend.length === 0) return "—";
  const [y, m] = trend[trend.length - 1].ym.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${y}`;
}
function maxMonth(trend: { gross: number }[]): number {
  return trend.reduce((m, p) => (p.gross > m ? p.gross : m), 0);
}

function ViewSwitch({
  mode,
  onMode,
  year,
  onYear,
}: {
  mode: "lifetime" | "year";
  onMode: (m: "lifetime" | "year") => void;
  year: number;
  onYear: (y: number) => void;
}) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-center rounded-md border bg-card p-0.5">
        {(["year", "lifetime"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
              mode === m ? "bg-white/[0.06] text-white" : "text-steel hover:text-white",
            )}
          >
            {m === "year" ? "Year" : "Lifetime"}
          </button>
        ))}
      </div>
      <select
        value={year}
        onChange={(e) => onYear(Number(e.target.value))}
        disabled={mode === "lifetime"}
        className={cn(
          "h-8 rounded-md border bg-background px-2 text-[12px]",
          mode === "lifetime" && "opacity-40",
        )}
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

// R5 follow-up: local KpiTile removed — consolidated onto
// `MetricStrip` / `MetricTile` from @/components/recast.

function PlatformCard({
  label,
  summary,
}: {
  label: string;
  summary: { gross: number; recastCommission: number; creatorTakeHome: number; periodCount: number };
}) {
  if (summary.periodCount === 0) {
    return (
      <div className="rounded-md border border-dashed border-rule p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
          {label}
        </div>
        <div className="mt-2 text-[12px] text-steel">No periods on file.</div>
      </div>
    );
  }
  const effective =
    summary.gross > 0 ? (summary.recastCommission / summary.gross) * 100 : 0;
  return (
    <div className="rounded-md border bg-[#0d0d0d] p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
          {label}
        </div>
        <span className="text-[10px] text-steel">
          {summary.periodCount} period{summary.periodCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="tabular mt-2 font-display text-[22px] font-extrabold leading-none text-white">
        {formatUSD(summary.gross, { decimals: 0 })}
      </div>
      <div className="text-[11px] text-steel">Gross billed</div>
      <div className="mt-2 space-y-0.5 border-t border-rule pt-2 text-[11px]">
        <div className="flex justify-between text-paid">
          <span>Recast commission</span>
          <span className="tabular">
            {formatUSD(summary.recastCommission, { decimals: 0 })}
          </span>
        </div>
        <div className="flex justify-between text-steel">
          <span>Creator take-home</span>
          <span className="tabular">
            {formatUSD(summary.creatorTakeHome, { decimals: 0 })}
          </span>
        </div>
        <div className="flex justify-between text-steel">
          <span>Effective rate</span>
          <span className="tabular">{effective.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function Th({
  right,
  children,
}: {
  right?: boolean;
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-steel",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unpaid: "bg-unpaid-tint text-steel",
    partial: "bg-partial-tint text-partial",
    paid: "bg-paid-tint text-paid",
    overdue: "bg-overdue-tint text-overdue",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        styles[status] ?? "bg-unpaid-tint text-steel",
      )}
    >
      {status}
    </span>
  );
}
