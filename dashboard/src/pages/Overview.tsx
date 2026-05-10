import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertOctagon,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * Phase L (C1.2a): Overview matched to the Claude Design mockup.
 *
 * Top → bottom hierarchy:
 *   1. Live-sync eyebrow strip (ABOVE the title, not inline)
 *   2. Header row: title + description // search + Export + year
 *   3. Overdue alert banner — only renders if data.most_overdue.length > 0
 *   4. 4-up KPI tiles — each with icon + sparkline + delta pill
 *   5. Cash flow chart — inline YTD + YoY pill, current-month line
 *   6. Three lists with progress-bar row underlines
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
  const currentMonthIdx = now.getMonth(); // 0-based
  const currentMonthLabel = MONTH_LABELS[currentMonthIdx];
  const prevMonthIdx = currentMonthIdx - 1;
  const prevMonth = data?.monthly && prevMonthIdx >= 0 ? data.monthly[prevMonthIdx] : null;
  const prevMonthLabel = prevMonthIdx >= 0 ? MONTH_LABELS[prevMonthIdx] : "—";

  const inflowDelta = splitDelta(data?.inflow_this_month ?? 0, prevMonth?.inflow ?? 0, prevMonthLabel);
  const outflowDelta = splitDelta(data?.outflow_this_month ?? 0, prevMonth?.outflow ?? 0, prevMonthLabel, /* invert */ true);
  const netDelta = splitDelta(data?.net_this_month ?? 0, prevMonth?.net ?? 0, prevMonthLabel);

  // Sparkline series — slice each KPI's monthly stream up to and
  // including the current month, so the line ends "now".
  const inflowSeries = (data?.monthly ?? []).slice(0, currentMonthIdx + 1).map((m) => m.inflow);
  const outflowSeries = (data?.monthly ?? []).slice(0, currentMonthIdx + 1).map((m) => m.outflow);
  const netSeries = (data?.monthly ?? []).slice(0, currentMonthIdx + 1).map((m) => m.net);

  // YTD totals + YoY% for the chart inline header.
  const ytd = sumNet(data?.monthly ?? []);
  const ytdPrev = sumNet(data?.monthly_prev_year ?? []);
  const ytdDeltaPct = ytdPrev !== 0 ? ((ytd - ytdPrev) / Math.abs(ytdPrev)) * 100 : null;

  const hasOverdue = (data?.most_overdue.length ?? 0) > 0;
  const showBanner = !bannerHidden && hasOverdue;

  return (
    <div className="space-y-5">
      {/* ── 1. Live-sync eyebrow strip (ABOVE title) ───────────────── */}
      <div className="flex items-center justify-between gap-3 border-b pb-3 text-eyebrow text-steel">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-paid" />
          <span className="text-paid">Live</span>
          <span>·</span>
          <span>SYNCED 30S</span>
          <span>·</span>
          <span>{year} YTD</span>
        </span>
      </div>

      {/* ── 2. Header row ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {/* Tracking is encoded in the text-display token (-0.022em).
              No tracking-tight, no font-extrabold, no font-display —
              the size token + base CSS rule handle all of those. */}
          <h1 className="text-display">Overview</h1>
          <p className="mt-1 text-small text-steel">
            What&apos;s coming in, what&apos;s going out, what&apos;s overdue.
            Click any number to drill in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput />
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

      {/* ── 3. Overdue alert banner ────────────────────────────────── */}
      {showBanner && data ? (
        <OverdueBanner
          items={data.most_overdue}
          totalAmount={data.outstanding_overdue}
          onHide={() => setBannerHidden(true)}
        />
      ) : null}

      {/* ── 4. 4-up KPI tiles ──────────────────────────────────────── */}
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
              icon={ArrowDownLeft}
              amount={data.inflow_this_month}
              deltaPct={inflowDelta?.pct}
              vs={inflowDelta?.vs}
              sparkline={{ values: inflowSeries, tone: "paid" }}
            />
            <KpiTile
              label="Outflow this month"
              icon={ArrowUpRight}
              amount={data.outflow_this_month}
              deltaPct={outflowDelta?.pct}
              vs={outflowDelta?.vs}
              sparkline={{ values: outflowSeries, tone: "overdue" }}
            />
            <KpiTile
              label="Net this month"
              icon={TrendingUp}
              amount={data.net_this_month}
              deltaPct={netDelta?.pct}
              vs={netDelta?.vs ?? "Inflow − Outflow"}
              sparkline={{ values: netSeries, tone: "electric" }}
            />
            <KpiTile
              label="Outstanding overdue"
              icon={hasOverdue ? AlertCircle : Clock}
              amount={data.outstanding_overdue}
              tone={hasOverdue ? "partial" : "default"}
              deltaPct={
                hasOverdue
                  ? { tone: "partial", text: `${data.most_overdue.length} item${data.most_overdue.length === 1 ? "" : "s"}` }
                  : { tone: "paid", text: "All clear" }
              }
              meta={
                hasOverdue
                  ? `Oldest ${data.most_overdue[0].days_overdue}d · ${new Set(data.most_overdue.map(o => o.source)).size} sections`
                  : "Nothing overdue"
              }
            />
          </>
        )}
      </div>

      {/* ── 5. Cash flow chart ─────────────────────────────────────── */}
      <Card className="p-tile-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <EyebrowLabel>Cash flow · {year}</EyebrowLabel>
            <MoneyCell amount={ytd} size="h2" splitDecimals={false} tone={ytd >= 0 ? "default" : "overdue"} />
            {ytdDeltaPct != null ? (
              <span
                className={cn(
                  "tabular rounded-sm px-1.5 py-0.5 text-eyebrow",
                  ytdDeltaPct >= 0 ? "bg-paid-tint text-paid" : "bg-overdue-tint text-overdue",
                )}
              >
                {ytdDeltaPct >= 0 ? "+" : ""}
                {ytdDeltaPct.toFixed(1)}% YoY
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <ChartLegend />
            <CompareSwitch
              checked={compareYoY}
              onChange={setCompareYoY}
              label={`Compare ${year - 1}`}
            />
          </div>
        </div>
        <div className="mt-4">
          {isLoading || !data ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <FlowChart
              monthly={data.monthly}
              monthlyPrev={compareYoY ? data.monthly_prev_year : null}
              prevYear={year - 1}
              currentMonth={currentMonthIdx + 1}
              currentMonthLabel={currentMonthLabel}
              isCurrentYear={year === currentYear}
            />
          )}
        </div>
      </Card>

      {/* ── 6. Three lists ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ListPanel
          title="Most overdue"
          eyebrow={`${data?.most_overdue.length ?? 0} items · sorted by days late`}
          empty="Nothing overdue — clean."
          loading={isLoading}
          headerLink={{ to: "/finance", label: "All" }}
          rows={(data?.most_overdue ?? []).map((r, i) => ({
            rank: String(i + 1).padStart(2, "0"),
            primary: r.name,
            secondary: `${SECTION_LABEL[r.source]} · ${MONTH_LABELS[r.period_month - 1]} ${r.period_year}`,
            value: r.amount,
            badge: { text: `${r.days_overdue}d`, status: "overdue" as const },
          }))}
        />
        <ListPanel
          title="Top talent · this month"
          eyebrow="Tele + OnlyFans gross combined"
          empty="No talent performance recorded yet this month."
          loading={isLoading}
          headerLink={{ to: "/roster", label: "Roster" }}
          rows={(data?.top_talents ?? []).map((t) => ({
            avatarName: t.name,
            primary: t.name,
            secondary: SECTION_LABEL[t.source],
            value: t.gross,
          }))}
        />
        <ListPanel
          title="Top vendor spend · this month"
          eyebrow="Paid out · highest first"
          empty="No vendor payments logged yet this month."
          loading={isLoading}
          headerLink={{ to: "/finance", label: "Vendors" }}
          rows={(data?.top_vendors ?? []).map((v) => ({
            avatarName: v.name,
            primary: v.name,
            secondary: "Vendor",
            value: v.paid,
          }))}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Search input — visual stub. ⌘K hint hooks into a future command palette.
// ─────────────────────────────────────────────────────────────────────

function SearchInput() {
  return (
    <div className="relative hidden sm:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" />
      <Input
        type="search"
        placeholder="Search…"
        className="h-9 w-56 pl-8 pr-12 text-small"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1 py-0.5 font-mono text-eyebrow text-steel">
        ⌘K
      </kbd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Compare switch (replaces the old checkbox)
// ─────────────────────────────────────────────────────────────────────

function CompareSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-small transition-colors duration-base ease-out",
        checked && "border-electric bg-electric/10 text-foreground",
      )}
    >
      <span
        className={cn(
          "relative h-3.5 w-6 rounded-full transition-colors duration-base ease-out",
          checked ? "bg-electric" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all duration-base ease-out",
            checked ? "left-[14px]" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Chart legend — colored chips for inflow / outflow / 2025 (when on)
// ─────────────────────────────────────────────────────────────────────

function ChartLegend() {
  return (
    <div className="hidden items-center gap-3 text-small text-steel md:flex">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-sm bg-electric" />
        Inflow
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-sm bg-[#3a3f4b]" />
        Outflow
      </span>
    </div>
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
  items: { source: string; name: string; period_month: number; period_year: number; days_overdue: number; amount: number }[];
  totalAmount: number;
  onHide: () => void;
}) {
  const sectionCount = new Set(items.map((i) => i.source)).size;
  const oldest = items[0]?.days_overdue ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-overdue/30 bg-overdue-tint">
      {/* Top strip with total + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-overdue px-tile-md py-3">
        <div className="flex items-center gap-2.5">
          <AlertOctagon className="h-4 w-4 text-overdue" />
          <span className="text-body">
            <span className="font-semibold">{items.length} payments past deadline</span>
            <span className="text-steel"> — total </span>
            <MoneyCell amount={totalAmount} size="body" tone="overdue" splitDecimals={false} className="font-semibold" />
            <span className="text-steel"> outstanding across {sectionCount} section{sectionCount === 1 ? "" : "s"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-small text-steel">
            Oldest <span className="font-semibold text-foreground">{oldest} d</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onHide}
            className="text-steel hover:text-foreground"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Hide
          </Button>
          <Button asChild variant="default" size="sm">
            <Link to="/finance">Open Finance</Link>
          </Button>
        </div>
      </div>
      {/* 2-column grid of overdue items */}
      <div className="grid grid-cols-1 gap-x-tile-md gap-y-2 px-tile-md py-3 sm:grid-cols-2">
        {items.slice(0, 6).map((item, i) => (
          <div key={i} className="flex items-center gap-3 text-small">
            <EyebrowLabel className="w-20 shrink-0 text-steel">
              {SECTION_LABEL[item.source] ?? item.source}
            </EyebrowLabel>
            <span className="flex-1 truncate font-medium text-foreground">
              {item.name} · {MONTH_LABELS[item.period_month - 1]}
            </span>
            <MoneyCell amount={item.amount} size="small" splitDecimals={false} className="font-semibold" />
            <span className="w-16 shrink-0 text-right text-eyebrow text-overdue">
              {item.days_overdue}d late
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cash flow chart — spec colours + current-month highlight
// ─────────────────────────────────────────────────────────────────────

function FlowChart({
  monthly,
  monthlyPrev,
  prevYear,
  currentMonth,
  currentMonthLabel,
  isCurrentYear,
}: {
  monthly: MonthlyFlow[];
  monthlyPrev: MonthlyFlow[] | null;
  prevYear: number;
  currentMonth: number;
  currentMonthLabel: string;
  isCurrentYear: boolean;
}) {
  const data = monthly.map((m, i) => {
    const prev = monthlyPrev?.[i];
    return {
      month: MONTH_LABELS[m.month - 1],
      Inflow: m.inflow,
      Outflow: m.outflow,
      ...(prev
        ? {
            [`Inflow ${prevYear}`]: prev.inflow,
            [`Outflow ${prevYear}`]: prev.outflow,
          }
        : {}),
    };
  });

  // Custom X-axis tick — bolds the current month, dims future months.
  // Recharts types `x` as string | number; we coerce.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTick = (props: any) => {
    const x = Number(props.x) || 0;
    const y = Number(props.y) || 0;
    const value: string = props.payload?.value ?? "";
    const monthIdx = MONTH_LABELS.indexOf(value);
    const isCurrent = isCurrentYear && monthIdx === currentMonth - 1;
    const isFuture = isCurrentYear && monthIdx > currentMonth - 1;
    return (
      <text
        x={x}
        y={y + 14}
        textAnchor="middle"
        className={cn(
          "text-[11px]",
          isCurrent && "font-semibold",
          isFuture && "opacity-40",
        )}
        fill={isCurrent ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
      >
        {value}
      </text>
    );
  };

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="rc-inflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#1A4FCC" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="month"
            tick={renderTick}
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
          {/* Vertical separator at current month — the "now" cursor */}
          {isCurrentYear ? (
            <ReferenceLine
              x={currentMonthLabel}
              stroke="hsl(var(--border))"
              strokeDasharray="2 4"
            />
          ) : null}
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
  headerLink,
}: {
  title: string;
  eyebrow: string;
  empty: string;
  loading: boolean;
  rows: ListRow[];
  headerLink?: { to: string; label: string };
}) {
  // Max value for normalising the progress-bar widths.
  const maxValue = rows.length > 0 ? Math.max(...rows.map((r) => r.value)) : 0;

  return (
    <Card className="flex h-full flex-col p-tile-md">
      {/* Header: title + eyebrow on left, link on right */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-h3 font-semibold tracking-tight">{title}</h3>
          <EyebrowLabel className="mt-1">{eyebrow}</EyebrowLabel>
        </div>
        {headerLink ? (
          <Link
            to={headerLink.to}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-eyebrow text-steel transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-foreground"
          >
            {headerLink.label}
            <span className="text-electric">↗</span>
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-small text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, i) => {
              const widthPct = maxValue > 0 ? (r.value / maxValue) * 100 : 0;
              return (
                <li key={i} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    {r.rank ? (
                      <span className="tabular w-6 shrink-0 text-eyebrow text-steel">
                        {r.rank}
                      </span>
                    ) : null}
                    {r.avatarName ? <Avatar name={r.avatarName} size="sm" /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium text-foreground">
                        {r.primary}
                      </div>
                      <div className="truncate text-eyebrow text-steel">
                        {r.secondary}
                      </div>
                    </div>
                    {r.badge ? (
                      <StatusPill status={r.badge.status} label={r.badge.text} />
                    ) : null}
                    <MoneyCell amount={r.value} size="body" splitDecimals={false} className="font-semibold" />
                  </div>
                  {/* Progress-bar underline (relative size within the panel) */}
                  <div className="ml-9 h-0.5 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        r.badge?.status === "overdue" ? "bg-overdue/60" : "bg-electric/60",
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
      <Skeleton className="mt-3 h-8 w-full" />
      <Skeleton className="mt-2 h-3 w-40" />
    </div>
  );
}

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
// Year selector
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
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tabular h-9 rounded-md border bg-background px-3 text-small transition-colors duration-base ease-out focus:outline-none focus:ring-1 focus:ring-electric"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
