import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Clock,
  TrendingUp,
} from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinanceOverview, type MonthlyFlow } from "@/hooks/useFinanceOverview";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

/**
 * Phase K-5 (partial): the Overview landing page.
 *
 * First thing admin/finance see when they sign in. Reads from
 * useFinanceOverview which aggregates payment_receipts + the six
 * period tables. Auto-refetches every 30s plus on window-focus, so
 * an open Overview tab in the background stays current without
 * forcing a manual reload.
 *
 * Year selector at the top right scopes the trend chart only — the
 * KPI tiles and top-5 panels are always relative to the CURRENT
 * month, regardless of selected year. That mirrors how Gustavo
 * actually thinks about money: "what's my current state" and
 * "what's the year shape" are two different questions.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function OverviewPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [compareYoY, setCompareYoY] = React.useState(false);
  const { data, isLoading } = useFinanceOverview(year);

  const monthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Live snapshot of Recast finance. KPIs are for {monthLabel}; the
            trend below covers the selected year.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Inflow this month"
          value={data?.inflow_this_month}
          loading={isLoading}
          tone="positive"
          icon={<ArrowDownRight className="h-4 w-4" />}
          hint="Receipts received from talent, brands, residents"
        />
        <KPI
          label="Outflow this month"
          value={data?.outflow_this_month}
          loading={isLoading}
          tone="negative"
          icon={<ArrowUpRight className="h-4 w-4" />}
          hint="Vendor + utility receipts paid out"
        />
        <KPI
          label="Net this month"
          value={data?.net_this_month}
          loading={isLoading}
          tone={
            data?.net_this_month != null
              ? data.net_this_month >= 0
                ? "positive"
                : "negative"
              : "neutral"
          }
          icon={<TrendingUp className="h-4 w-4" />}
          hint="Inflow − outflow this calendar month"
        />
        <KPI
          label="Outstanding overdue"
          value={data?.outstanding_overdue}
          loading={isLoading}
          tone="warning"
          icon={<Clock className="h-4 w-4" />}
          hint={`${data?.most_overdue.length ?? 0} most-late items below`}
          link="/finance"
        />
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Monthly cash flow — {year}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Inflow vs outflow by month, from receipts logged in the ledger.
              {compareYoY && ` Dotted lines = ${year - 1}.`}
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={compareYoY}
              onChange={(e) => setCompareYoY(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Compare to {year - 1}
          </label>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <FlowChart
              monthly={data.monthly}
              monthlyPrev={compareYoY ? data.monthly_prev_year : null}
              prevYear={year - 1}
            />
          )}
        </CardContent>
      </Card>

      {/* Top-5 panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopPanel
          title="Most overdue"
          description="Highest days-past-due across every section"
          empty="Nothing overdue — clean."
          loading={isLoading}
          rows={(data?.most_overdue ?? []).map((r) => ({
            primary: r.name,
            secondary: `${MONTH_LABELS[r.period_month - 1]} ${r.period_year} · ${SECTION_LABEL[r.source]}`,
            value: formatUSD(r.amount, { decimals: 2 }),
            badge: `${r.days_overdue}d`,
            badgeTone: "rose",
          }))}
          footerLink={{ to: "/finance", label: "Open Finance" }}
        />
        <TopPanel
          title="Top talents this month"
          description="By gross revenue · Tele + OnlyFans"
          empty="No talent performance recorded yet this month."
          loading={isLoading}
          rows={(data?.top_talents ?? []).map((t) => ({
            primary: t.name,
            secondary: `${SECTION_LABEL[t.source]} · commission ${formatUSDCompact(t.commission)}`,
            value: formatUSD(t.gross, { decimals: 0 }),
          }))}
          footerLink={{ to: "/finance", label: "Open Finance" }}
        />
        <TopPanel
          title="Top vendor spend this month"
          description="Vendors paid the most this calendar month"
          empty="No vendor payments logged yet this month."
          loading={isLoading}
          rows={(data?.top_vendors ?? []).map((v) => ({
            primary: v.name,
            secondary: "Vendor",
            value: formatUSD(v.paid, { decimals: 2 }),
          }))}
          footerLink={{ to: "/finance", label: "Open Vendors" }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// KPI tile
// ─────────────────────────────────────────────────────────────────────

function KPI({
  label,
  value,
  loading,
  tone,
  icon,
  hint,
  link,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  tone: "positive" | "negative" | "warning" | "neutral";
  icon: React.ReactNode;
  hint: string;
  link?: string;
}) {
  const toneStyles: Record<typeof tone, string> = {
    positive: "text-emerald-700 dark:text-emerald-400",
    negative: "text-rose-700 dark:text-rose-400",
    warning: "text-amber-700 dark:text-amber-400",
    neutral: "text-foreground",
  } as const;

  const body = (
    <Card className="h-full transition hover:bg-muted/20">
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="truncate">{label}</span>
          <span className={cn("shrink-0", toneStyles[tone])}>{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-32" />
        ) : (
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              toneStyles[tone],
            )}
          >
            {value != null ? formatUSD(value, { decimals: 2 }) : "—"}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );

  return link ? (
    <Link to={link} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

// ─────────────────────────────────────────────────────────────────────
// Trend chart
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
  // Merge by month index so prev-year keys align with the X-axis ticks.
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
          <Bar dataKey="Inflow" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Outflow" fill="hsl(0 72% 51%)" radius={[3, 3, 0, 0]} />
          {monthlyPrev && (
            <>
              <Line
                type="monotone"
                dataKey={`Inflow ${prevYear}`}
                stroke="hsl(142 71% 45%)"
                strokeDasharray="4 3"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={`Outflow ${prevYear}`}
                stroke="hsl(0 72% 51%)"
                strokeDasharray="4 3"
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
// Top-N panel
// ─────────────────────────────────────────────────────────────────────

interface TopRow {
  primary: string;
  secondary: string;
  value: string;
  badge?: string;
  badgeTone?: "rose" | "amber" | "emerald";
}

function TopPanel({
  title,
  description,
  empty,
  loading,
  rows,
  footerLink,
}: {
  title: string;
  description: string;
  empty: string;
  loading: boolean;
  rows: TopRow[];
  footerLink?: { to: string; label: string };
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {loading ? (
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ul className="space-y-1">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {r.primary}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {r.secondary}
                  </div>
                </div>
                {r.badge && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      r.badgeTone === "rose" && "bg-rose-500/15 text-rose-700 dark:text-rose-400",
                      r.badgeTone === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      r.badgeTone === "emerald" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {r.badge}
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        )}
        {footerLink && rows.length > 0 && (
          <Link
            to={footerLink.to}
            className="mt-auto inline-flex items-center justify-end gap-0.5 pt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {footerLink.label} <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Year selector (mirrors the one on /finance)
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
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Year:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border bg-background px-2 py-1 text-sm"
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

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const SECTION_LABEL: Record<string, string> = {
  vendor: "Vendor",
  campaign: "Campaign",
  telegram: "Telegram",
  onlyfans: "OnlyFans",
  house_rent: "Rent",
  house_utility: "Utility",
};
