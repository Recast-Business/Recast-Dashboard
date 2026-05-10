import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import {
  Avatar,
  EyebrowLabel,
  KpiTile,
  MoneyCell,
  StatusPill,
} from "@/components/recast";
import { useFinanceOverview, type MonthlyFlow } from "@/hooks/useFinanceOverview";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

/**
 * Phase L (C1): Overview rebuilt around the design system.
 *
 * Information hierarchy (top → bottom):
 *   1. Header (title + live-sync chip + year selector)
 *   2. Overdue alert banner — answers "who do I chase today?" first
 *   3. 4-up KPI row (Inflow / Outflow / Net / Outstanding)
 *   4. Cash flow chart — spec-compliant colours, YoY toggle
 *   5. Three lists: Most overdue / Top talent / Top vendor
 *
 * Data hook unchanged from the K-5 version — only the visual layer
 * was refactored to use Recast primitives + canonical chart colours.
 *
 * See dashboard/docs/DESIGN.md for recipe references.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SECTION_LABEL: Record<string, string> = {
  vendor: "Vendor",
  campaign: "Campaign",
  telegram: "Telegram",
  onlyfans: "OnlyFans",
  house_rent: "Rent",
  house_utility: "Utility",
};

export function OverviewPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [compareYoY, setCompareYoY] = React.useState(false);
  const [bannerHidden, setBannerHidden] = React.useState(false);
  const { data, isLoading } = useFinanceOverview(year);

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Compute prev-month deltas client-side from the monthly array.
  // (data.monthly[i] is keyed 1-12; current month is now.getMonth()+1.)
  const currentMonthIdx = now.getMonth(); // 0-based
  const prevMonthIdx = currentMonthIdx - 1;
  const prevMonth = data?.monthly && prevMonthIdx >= 0 ? data.monthly[prevMonthIdx] : null;
  const prevMonthLabel = prevMonthIdx >= 0 ? MONTH_LABELS[prevMonthIdx] : "—";

  const inflowDelta = splitDelta(data?.inflow_this_month ?? 0, prevMonth?.inflow ?? 0, prevMonthLabel);
  const outflowDelta = splitDelta(data?.outflow_this_month ?? 0, prevMonth?.outflow ?? 0, prevMonthLabel, /* invert */ true);
  const netDelta = splitDelta(data?.net_this_month ?? 0, prevMonth?.net ?? 0, prevMonthLabel);

  // YTD totals + YoY% for the chart header.
  const ytd = sumNet(data?.monthly ?? []);
  const ytdPrev = sumNet(data?.monthly_prev_year ?? []);
  const ytdDeltaPct = ytdPrev !== 0 ? ((ytd - ytdPrev) / Math.abs(ytdPrev)) * 100 : null;

  const showBanner =
    !bannerHidden && (data?.most_overdue.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-h2 font-semibold tracking-tight">
              Overview
            </h1>
            <LiveSyncChip year={year} />
          </div>
          <p className="mt-1 text-small text-muted-foreground">
            What&apos;s coming in, what&apos;s going out, what&apos;s overdue. KPIs
            are for {monthLabel}; the trend below covers {year}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCSVButton
            filename={`recast-overdue-${year}.csv`}
            rows={data?.most_overdue ?? []}
            label="Export"
            disabled={!data?.most_overdue.length}
            columns={[
              { header: "Section", value: (r) => SECTION_LABEL[r.source] ?? r.source },
              { header: "Name", value: (r) => r.name },
              { header: "Period", value: (r) => `${MONTH_LABELS[r.period_month - 1]} ${r.period_year}` },
              { header: "Amount", value: (r) => r.amount.toFixed(2) },
              { header: "Days late", value: (r) => String(r.days_overdue) },
            ]}
          />
          <YearSelector value={year} onChange={setYear} />
        </div>
      </div>

      {/* ── Overdue alert banner ───────────────────────────────────── */}
      {showBanner && data ? (
        <OverdueBanner
          items={data.most_overdue}
          totalAmount={data.outstanding_overdue}
          onHide={() => setBannerHidden(true)}
        />
      ) : null}

      {/* ── 4-up KPI tiles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <KpiTile
              label="Inflow this month"
              amount={data.inflow_this_month}
              deltaPct={inflowDelta?.pct}
              vs={inflowDelta?.vs}
            />
            <KpiTile
              label="Outflow this month"
              amount={data.outflow_this_month}
              deltaPct={outflowDelta?.pct}
              vs={outflowDelta?.vs}
            />
            <KpiTile
              label="Net this month"
              amount={data.net_this_month}
              deltaPct={netDelta?.pct}
              vs={netDelta?.vs ?? "Inflow − Outflow"}
            />
            <KpiTile
              label="Outstanding overdue"
              amount={data.outstanding_overdue}
              deltaPct={
                data.most_overdue.length
                  ? { tone: "overdue", text: `${data.most_overdue.length} item${data.most_overdue.length === 1 ? "" : "s"}` }
                  : { tone: "paid", text: "All clear" }
              }
              meta={
                data.most_overdue.length
                  ? `Oldest ${data.most_overdue[0].days_overdue}d · ${new Set(data.most_overdue.map(o => o.source)).size} sections`
                  : "Nothing overdue"
              }
            />
          </>
        )}
      </div>

      {/* ── Cash flow chart ────────────────────────────────────────── */}
      <Card className="p-tile-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <EyebrowLabel>Cash flow · {year}</EyebrowLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <MoneyCell amount={ytd} size="h2" splitDecimals={false} />
              {ytdDeltaPct != null ? (
                <span
                  className={cn(
                    "tabular text-small",
                    ytdDeltaPct >= 0 ? "text-paid" : "text-overdue",
                  )}
                >
                  {ytdDeltaPct >= 0 ? "+" : ""}
                  {ytdDeltaPct.toFixed(1)}% YoY
                </span>
              ) : null}
            </div>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-small">
            <input
              type="checkbox"
              checked={compareYoY}
              onChange={(e) => setCompareYoY(e.target.checked)}
              className="h-3.5 w-3.5 accent-electric"
            />
            Compare {year - 1}
          </label>
        </div>
        <div className="mt-4">
          {isLoading || !data ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <FlowChart
              monthly={data.monthly}
              monthlyPrev={compareYoY ? data.monthly_prev_year : null}
              prevYear={year - 1}
            />
          )}
        </div>
      </Card>

      {/* ── Three lists ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ListPanel
          title="Most overdue"
          eyebrow={`${data?.most_overdue.length ?? 0} items · sorted by days late`}
          empty="Nothing overdue — clean."
          loading={isLoading}
          rows={(data?.most_overdue ?? []).map((r, i) => ({
            rank: String(i + 1).padStart(2, "0"),
            primary: r.name,
            secondary: `${SECTION_LABEL[r.source]} · ${MONTH_LABELS[r.period_month - 1]} ${r.period_year}`,
            value: r.amount,
            badge: { text: `${r.days_overdue}d`, status: "overdue" as const },
          }))}
          footerLink={{ to: "/finance", label: "All overdue" }}
        />
        <ListPanel
          title="Top talent · this month"
          eyebrow="Tele + OnlyFans gross combined"
          empty="No talent performance recorded yet this month."
          loading={isLoading}
          rows={(data?.top_talents ?? []).map((t) => ({
            avatarName: t.name,
            primary: t.name,
            secondary: `${SECTION_LABEL[t.source]} · commission ${formatUSDCompact(t.commission)}`,
            value: t.gross,
          }))}
          footerLink={{ to: "/roster", label: "Roster" }}
        />
        <ListPanel
          title="Top vendor spend · this month"
          eyebrow="Paid out · highest first"
          empty="No vendor payments logged yet this month."
          loading={isLoading}
          rows={(data?.top_vendors ?? []).map((v) => ({
            avatarName: v.name,
            primary: v.name,
            secondary: "Vendor",
            value: v.paid,
          }))}
          footerLink={{ to: "/finance", label: "Vendors" }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Live-sync chip (top of header)
// ─────────────────────────────────────────────────────────────────────

function LiveSyncChip({ year }: { year: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-paid/30 bg-paid-tint px-2.5 py-0.5 text-eyebrow text-paid">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-paid" />
      Live · synced 30s · {year} YTD
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Overdue alert banner — first thing in eyeline if anything is late
// ─────────────────────────────────────────────────────────────────────

function OverdueBanner({
  items,
  totalAmount,
  onHide,
}: {
  items: { source: string; name: string; period_month: number; days_overdue: number; amount: number }[];
  totalAmount: number;
  onHide: () => void;
}) {
  const sectionCount = new Set(items.map((i) => i.source)).size;
  const oldest = items[0]?.days_overdue ?? 0;

  return (
    <div className="rounded-lg border border-overdue/30 bg-overdue-tint p-tile-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <EyebrowLabel className="text-overdue">
            {items.length} payments past deadline
          </EyebrowLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <MoneyCell amount={totalAmount} size="h2" tone="overdue" />
            <span className="text-small text-steel">
              outstanding across {sectionCount} section{sectionCount === 1 ? "" : "s"}
            </span>
            <span className="text-small text-overdue">· Oldest {oldest}d</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="default" size="sm">
            <Link to="/finance">Open Finance</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onHide}
            aria-label="Hide alert"
          >
            <X className="h-4 w-4" />
            Hide
          </Button>
        </div>
      </div>

      {/* Inline chip strip — top items. Capped at 6 to keep it scannable. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {items.slice(0, 6).map((item, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-2 rounded-md border border-overdue/20 bg-card px-2.5 py-1.5 text-small"
          >
            <EyebrowLabel className="text-steel">
              {SECTION_LABEL[item.source] ?? item.source}
            </EyebrowLabel>
            <span className="truncate font-medium text-foreground">
              {item.name} · {MONTH_LABELS[item.period_month - 1]}
            </span>
            <MoneyCell amount={item.amount} size="small" splitDecimals={false} />
            <StatusPill status="overdue" label={`${item.days_overdue}D LATE`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cash flow chart — spec colours
//   • Inflow:   vertical gradient electric-lt → electric-dk
//   • Outflow:  solid #3a3f4b
//   • Prior yr: dashed (3 4) at 55% opacity
// ─────────────────────────────────────────────────────────────────────

function FlowChart({
  monthly,
  monthlyPrev,
  prevYear,
}: {
  monthly: MonthlyFlow[];
  monthlyPrev: MonthlyFlow[] | null;
  prevYear: number;
}) {
  const data = monthly.map((m, i) => {
    const prev = monthlyPrev?.[i];
    return {
      month: MONTH_LABELS[m.month - 1],
      Inflow: m.inflow,
      Outflow: m.outflow,
      Net: m.net,
      ...(prev
        ? {
            [`Inflow ${prevYear}`]: prev.inflow,
            [`Outflow ${prevYear}`]: prev.outflow,
          }
        : {}),
    };
  });

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rc-inflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#1A4FCC" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="month"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatUSDCompact(v)}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: unknown) =>
              formatUSD(typeof v === "number" ? v : Number(v) || 0, { decimals: 2 })
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
          <Bar dataKey="Inflow" fill="url(#rc-inflow)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Outflow" fill="#3a3f4b" radius={[3, 3, 0, 0]} />
          {monthlyPrev && (
            <>
              <Line
                type="monotone"
                dataKey={`Inflow ${prevYear}`}
                stroke="#2563EB"
                strokeOpacity={0.55}
                strokeDasharray="3 4"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={`Outflow ${prevYear}`}
                stroke="#3a3f4b"
                strokeOpacity={0.55}
                strokeDasharray="3 4"
                strokeWidth={2}
                dot={false}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// List panel (Most overdue / Top talent / Top vendor)
// ─────────────────────────────────────────────────────────────────────

interface ListRow {
  rank?: string;
  /** When set, renders a 2-letter avatar derived from this name. */
  avatarName?: string;
  primary: string;
  secondary: string;
  value: number;
  badge?: { text: string; status: "paid" | "partial" | "overdue" | "unpaid" };
}

function ListPanel({
  title,
  eyebrow,
  empty,
  loading,
  rows,
  footerLink,
}: {
  title: string;
  eyebrow: string;
  empty: string;
  loading: boolean;
  rows: ListRow[];
  footerLink?: { to: string; label: string };
}) {
  return (
    <Card className="flex h-full flex-col p-tile-md">
      <div>
        <h3 className="text-h3 font-semibold tracking-tight">{title}</h3>
        <EyebrowLabel className="mt-1">{eyebrow}</EyebrowLabel>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-1">
        {loading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-small text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ul className="space-y-1">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-base ease-out hover:bg-electric/5"
              >
                {r.rank ? (
                  <span className="tabular w-6 text-eyebrow text-steel">{r.rank}</span>
                ) : null}
                {r.avatarName ? (
                  <Avatar name={r.avatarName} size="sm" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium text-foreground">
                    {r.primary}
                  </div>
                  <div className="truncate text-eyebrow text-steel">
                    {r.secondary}
                  </div>
                </div>
                {r.badge ? <StatusPill status={r.badge.status} label={r.badge.text} /> : null}
                <MoneyCell amount={r.value} size="body" splitDecimals={false} />
              </li>
            ))}
          </ul>
        )}
        {footerLink && rows.length > 0 ? (
          <Link
            to={footerLink.to}
            className="mt-auto inline-flex items-center justify-end gap-0.5 pt-2 text-eyebrow text-steel transition-colors duration-base ease-out hover:text-foreground"
          >
            {footerLink.label} <ChevronRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-tile-md">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-2 h-3 w-40" />
    </div>
  );
}

/**
 * Returns the % delta (for inline eyebrow) and the comparison line
 * (for below the amount) as separate strings, so KpiTile can render
 * them in their own slots. Outflow inverts the sign mapping (less
 * spend = paid green = good).
 */
function splitDelta(
  current: number,
  prev: number,
  prevLabel: string,
  invertSign: boolean = false,
): { pct: { tone: "paid" | "overdue"; text: string }; vs: string } | undefined {
  if (prev === 0) return undefined;
  const pctNum = ((current - prev) / Math.abs(prev)) * 100;
  const positive = invertSign ? pctNum < 0 : pctNum >= 0;
  const tone = positive ? "paid" : "overdue";
  const sign = pctNum >= 0 ? "+" : "";
  return {
    pct: { tone, text: `${sign}${pctNum.toFixed(1)}%` },
    vs: `vs ${formatUSDCompact(prev)} ${prevLabel}`,
  };
}

function sumNet(monthly: MonthlyFlow[]): number {
  return monthly.reduce((s, m) => s + m.net, 0);
}

// ─────────────────────────────────────────────────────────────────────
// Year selector (still uses raw <select> — small, doesn't justify Select)
// ─────────────────────────────────────────────────────────────────────

function YearSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (y: number) => void;
}) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
  return (
    <div className="flex items-center gap-2 text-small">
      <span className="text-steel">Year</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border bg-background px-2 py-1 text-body tabular transition-colors duration-base ease-out focus:outline-none focus:ring-1 focus:ring-electric"
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
