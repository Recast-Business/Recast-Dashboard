import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertOctagon,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  CircleDot,
  Clock,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
// Cash-flow chart is now a hand-authored inline SVG per spec §8 —
// Recharts is intentionally NOT used here. The geometry, gridlines,
// dashed prior-year polylines, and current-month guide are all coded
// to the canonical pixel coordinates so the chart matches the
// Claude Design mockup exactly.
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
    // Spec §2: vertical gap between every section is 24px.
    <div className="space-y-6">
      {/* ── 1. Topbar (header) per spec §4 — eyebrow + H1 + subtitle on
              the left, Export + Search + Year on the right, all inside
              one row, divider underneath at 20px bottom padding. */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div className="min-w-0">
          {/* Eyebrow: Inter 600 / 10px / 0.14em uppercase / steel
              + circle-dot lucide icon (spec §4 — NOT a pulsing dot div) */}
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
            <CircleDot className="h-3 w-3 text-paid" strokeWidth={1.5} />
            <span className="text-paid">Live</span>
            <span aria-hidden>·</span>
            <span>Synced 30s</span>
            <span aria-hidden>·</span>
            <span>{year} YTD</span>
          </div>
          {/* H1: display 800 / 38px / -0.022em / line-height 1
              (overrides the 36px text-display token per spec §4) */}
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            Overview
          </h1>
          {/* Subtitle: Inter 400 / 13.5px / steel / max 60ch / 1.55 lh */}
          <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
            What&apos;s coming in, what&apos;s going out, what&apos;s overdue.
            Click any number to drill in.
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
          <SearchInput />
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

      {/* ── 4. 4-up KPI tiles. Spec §6: gap 14px. ─────────────────── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
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
              tone="paid"
              deltaPct={netDelta?.pct}
              vs={netDelta?.vs ?? "Inflow − Outflow"}
              sparkline={{ values: netSeries, tone: "paid" }}
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
                  // YoY delta pill: meta treatment (Inter 500 / 11px /
                  // 0.04em) — not eyebrow caps. Matches the +18.2% YoY
                  // pill style from the mockup.
                  "tabular rounded-sm px-1.5 py-0.5 text-meta",
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
              currentMonth={currentMonthIdx + 1}
              isCurrentYear={year === currentYear}
            />
          )}
        </div>
      </Card>

      {/* ── 6. Three lists. Spec §9: gap 14px. ───────────────────── */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <ListPanel
          mode="ranked"
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
          mode="avatar"
          avatarTint="talent"
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
          mode="avatar"
          avatarTint="vendor"
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
  // Spec §4: 240px wide × 32px tall, bg ash, 1px rule, rounded-md,
  // padding 0 10px. Search icon + placeholder + ⌘K kbd chip on right.
  return (
    <div className="relative hidden sm:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" strokeWidth={1.5} />
      <Input
        type="search"
        placeholder="Search…"
        className="h-8 w-[240px] rounded-md border bg-card pl-8 pr-12 text-[13px] placeholder:text-steel"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-card px-1 py-0.5 font-mono text-[10px] text-steel">
        ⌘K
      </kbd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Compare switch (replaces the old checkbox)
// ─────────────────────────────────────────────────────────────────────

/**
 * Pill-shape switch per spec §8 — height 28px, padding 4px 10px 4px 8px.
 *   Off:  bg --ash, border --rule, color --steel
 *   On:   border 1px rgba(37,99,235,0.45), bg rgba(37,99,235,0.08),
 *         color white, inner pip slides left → right and recolours
 *         from --steel to --blue.
 */
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
        "inline-flex h-7 items-center gap-2 rounded-full border pl-2 pr-2.5 transition-colors duration-base ease-out",
        checked
          ? "border-[rgba(37,99,235,0.45)] bg-[rgba(37,99,235,0.08)] text-white"
          : "border-rule bg-ash text-steel",
      )}
    >
      <span
        className={cn(
          "relative h-3.5 w-6 rounded-full transition-colors duration-base ease-out",
          checked ? "bg-electric/30" : "bg-rule",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all duration-base ease-out",
            checked ? "left-[12px] bg-electric" : "left-0.5 bg-steel",
          )}
        />
      </span>
      <span className="text-[12px]">{label}</span>
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
      {/* Expanded item grid per spec §5 — 2 columns on sm+, gap 8/24,
          hairline rose top border separating from the header strip.
          Each row is a 4-column grid: 92px / 1fr / auto / auto. */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-overdue/15 px-tile-md py-3 sm:grid-cols-2">
        {items.slice(0, 6).map((item, i) => (
          <div
            key={i}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "92px 1fr auto auto" }}
          >
            {/* Cat eyebrow — Inter 600 / 10px / 0.12em caps / steel */}
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-steel">
              {SECTION_LABEL[item.source] ?? item.source}
            </span>
            {/* Name — Inter 500 / white */}
            <span className="truncate text-[13px] font-medium text-white">
              {item.name} · {MONTH_LABELS[item.period_month - 1]}
            </span>
            {/* Amount — Unbounded tabular / white (Phase L money override) */}
            <span className="tabular font-display text-[13px] font-bold text-white">
              {formatUSD(item.amount, { decimals: 0 })}
            </span>
            {/* Late chip — Inter 700 / 11px / overdue */}
            <span className="text-[11px] font-bold text-overdue">
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

/**
 * Cash-flow chart per canonical spec §8 — hand-authored inline SVG.
 *
 * Geometry (verbatim from spec):
 *   W=760, H=240, PAD={l:48, r:16, t:16, b:36}
 *   colW = innerW / 12
 *   barW = colW * 0.32
 *   y(v) = PAD.t + (1 − v/max) * innerH
 *
 * Render order:
 *   1. 5 horizontal gridlines + right-aligned $ axis labels
 *   2. Prior-year dashed polylines (only if compare on)
 *   3. Current-year paired bars + per-month vertical guide if current
 *   4. Month labels at y = H − 14
 *
 * Outer SVG uses `preserveAspectRatio="none"` so the chart fills the
 * container width. Height is fixed at 240px via the `<svg height>`
 * attribute, which means y-coords stay at native pixel size.
 */
function FlowChart({
  monthly,
  monthlyPrev,
  currentMonth,
  isCurrentYear,
}: {
  monthly: MonthlyFlow[];
  monthlyPrev: MonthlyFlow[] | null;
  currentMonth: number; // 1-12
  isCurrentYear: boolean;
}) {
  const W = 760;
  const H = 240;
  const PAD = { l: 48, r: 16, t: 16, b: 36 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const colW = innerW / 12;
  const barW = colW * 0.32;

  // Round 3D.3: hover tooltip — when the user hovers any month column,
  // surface the exact $ values for inflow / outflow (+ prior year if
  // compare is on). Fixes the C1.8 regression where the Recharts
  // built-in tooltip went away during the raw-SVG rewrite.
  const [hovered, setHovered] = React.useState<number | null>(null);

  // Find data max across both series; round up to a "nice" boundary so
  // the Y-axis labels read cleanly (e.g. $118k → $120k).
  const allValues = [
    ...monthly.flatMap((m) => [m.inflow, m.outflow]),
    ...(monthlyPrev ?? []).flatMap((m) => [m.inflow, m.outflow]),
  ].filter((v) => v > 0);
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 130000;
  const max = niceCeil(dataMax);

  const y = (v: number) => PAD.t + (1 - v / max) * innerH;
  const cx = (i: number) => PAD.l + i * colW + colW / 2;
  const currentMonthIdx0 = currentMonth - 1;

  // Helper for the tooltip's horizontal position. preserveAspectRatio
  // ="none" means the viewBox stretches with the container; converting
  // an SVG x-coord to a container percentage is just x / W.
  const colCenterPct = (i: number) => (cx(i) / W) * 100;

  const hoveredInflow = hovered !== null ? monthly[hovered]?.inflow ?? 0 : 0;
  const hoveredOutflow = hovered !== null ? monthly[hovered]?.outflow ?? 0 : 0;
  const hoveredPrevInflow = hovered !== null && monthlyPrev ? monthlyPrev[hovered]?.inflow ?? 0 : 0;
  const hoveredPrevOutflow = hovered !== null && monthlyPrev ? monthlyPrev[hovered]?.outflow ?? 0 : 0;

  return (
   <div className="relative">
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Monthly cash flow"
    >
      <defs>
        {/* 2-stop blue gradient per spec — 0% #3B82F6 → 100% #2563EB */}
        <linearGradient id="bar-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>

      {/* 1. Horizontal gridlines + Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const yPos = PAD.t + g * innerH;
        const value = max * (1 - g);
        return (
          <g key={g}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={yPos}
              y2={yPos}
              stroke="rgba(255,255,255,0.05)"
            />
            <text
              x={PAD.l - 8}
              y={yPos + 3}
              textAnchor="end"
              fontSize="10"
              fill="#6B7280"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatUSDCompact(value)}
            </text>
          </g>
        );
      })}

      {/* 2. Prior-year dashed polylines (only if compare on) */}
      {monthlyPrev && monthlyPrev.length === 12 ? (
        <>
          <polyline
            points={monthlyPrev.map((m, i) => `${cx(i)},${y(m.inflow)}`).join(" ")}
            stroke="#3B82F6"
            strokeWidth="1.4"
            strokeDasharray="3 4"
            strokeLinecap="round"
            strokeOpacity="0.55"
            fill="none"
          />
          <polyline
            points={monthlyPrev.map((m, i) => `${cx(i)},${y(m.outflow)}`).join(" ")}
            stroke="#6B7280"
            strokeWidth="1.4"
            strokeDasharray="3 4"
            strokeLinecap="round"
            strokeOpacity="0.55"
            fill="none"
          />
        </>
      ) : null}

      {/* 3. Current-year paired bars + per-month vertical guide */}
      {monthly.map((m, i) => {
        const isCurrent = isCurrentYear && i === currentMonthIdx0;
        const opacity = isCurrent ? 1 : 0.92;
        const inflowY = y(m.inflow);
        const outflowY = y(m.outflow);
        const inflowH = Math.max(0, H - PAD.b - inflowY);
        const outflowH = Math.max(0, H - PAD.b - outflowY);
        return (
          <g key={i}>
            {/* Inflow bar — left of center, gradient fill */}
            <rect
              x={cx(i) - barW - 1}
              y={inflowY}
              width={barW}
              height={inflowH}
              fill="url(#bar-blue)"
              rx="1.5"
              opacity={opacity}
            />
            {/* Outflow bar — right of center, solid #3a3f4b */}
            <rect
              x={cx(i) + 1}
              y={outflowY}
              width={barW}
              height={outflowH}
              fill="#3a3f4b"
              rx="1.5"
              opacity={opacity}
            />
            {/* Vertical guide — only on the current month */}
            {isCurrent ? (
              <line
                x1={cx(i)}
                x2={cx(i)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="rgba(37,99,235,0.30)"
                strokeDasharray="2 3"
              />
            ) : null}
          </g>
        );
      })}

      {/* 4. Month labels at y = H − 14 */}
      {monthly.map((_, i) => {
        const isCurrent = isCurrentYear && i === currentMonthIdx0;
        return (
          <text
            key={i}
            x={cx(i)}
            y={H - 14}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight={isCurrent ? "600" : "500"}
            fill={isCurrent ? "#FFFFFF" : "#6B7280"}
            letterSpacing="0.05em"
          >
            {MONTH_LABELS[i]}
          </text>
        );
      })}

      {/* 5. Invisible per-column hit-test rects for the tooltip.
          Painted last so they sit ON TOP of the bars and absorb hover
          events anywhere in the column — not just over the bars. */}
      {monthly.map((_, i) => (
        <rect
          key={`hit-${i}`}
          x={PAD.l + i * colW}
          y={PAD.t}
          width={colW}
          height={innerH}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        />
      ))}
    </svg>

    {/* Floating tooltip — only when a column is hovered. Positioned in
        container percentage so it tracks the column whatever the SVG
        is scaled to. Hairline border, no shadow (per spec §11
        "transient surfaces" exception is for popovers/dropdowns but we
        keep the discipline). */}
    {hovered !== null ? (
      <div
        className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border bg-card px-2.5 py-1.5 text-[11px] leading-tight"
        style={{ left: `${colCenterPct(hovered)}%` }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
          {MONTH_LABELS[hovered]}
          {isCurrentYear && hovered === currentMonthIdx0 ? (
            <span className="ml-1 text-electric">·</span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-electric">
            <span className="h-2 w-2 rounded-sm bg-electric" />
            Inflow
          </span>
          <span className="tabular font-display font-bold text-white">
            {formatUSDCompact(hoveredInflow)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-steel">
            <span className="h-2 w-2 rounded-sm bg-[#3a3f4b]" />
            Outflow
          </span>
          <span className="tabular font-display font-bold text-white">
            {formatUSDCompact(hoveredOutflow)}
          </span>
        </div>
        {monthlyPrev ? (
          <div className="mt-1.5 border-t border-rule pt-1.5 text-[10px] text-steel">
            <div className="flex items-center justify-between gap-3">
              <span>2025 in</span>
              <span className="tabular">{formatUSDCompact(hoveredPrevInflow)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>2025 out</span>
              <span className="tabular">{formatUSDCompact(hoveredPrevOutflow)}</span>
            </div>
          </div>
        ) : null}
      </div>
    ) : null}
   </div>
  );
}

/**
 * Round v UP to a "nice" axis boundary one decimal place above the
 * data magnitude. e.g.:
 *   118420 → 120000
 *   11833  → 12000
 *   522400 → 600000
 * Used for the Y-axis ceiling so $118k doesn't render against a
 * weirdly-tall $200k axis.
 */
function niceCeil(v: number): number {
  if (v <= 0) return 1000;
  const step = Math.pow(10, Math.floor(Math.log10(v) - 0.5));
  return Math.ceil(v / step) * step;
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

/**
 * ListPanel modes (per spec §9):
 *   • "ranked"  → Most Overdue layout. 22px rank (mono) + name/sub +
 *                 stacked amount/late-badge.
 *   • "avatar"  → Top Talent / Top Vendor layout. 22px tinted avatar
 *                 + name/3px-progress-bar + stacked amount/secondary.
 */
function ListPanel({
  title,
  eyebrow,
  empty,
  loading,
  rows,
  headerLink,
  mode,
  avatarTint,
}: {
  title: string;
  eyebrow: string;
  empty: string;
  loading: boolean;
  rows: ListRow[];
  headerLink?: { to: string; label: string };
  mode: "ranked" | "avatar";
  /** Tint for both avatar and progress-bar in avatar mode. */
  avatarTint?: "talent" | "vendor";
}) {
  const maxValue = rows.length > 0 ? Math.max(...rows.map((r) => r.value)) : 0;
  const progressBarBg =
    avatarTint === "vendor" ? "bg-steel" : "bg-electric";

  return (
    // Card recipe per spec §9 — header padding 14px 16px, rows
    // padding 9px 16px. Header has a hairline rule below.
    <Card className="flex h-full flex-col p-0">
      <div className="flex items-start justify-between gap-2 border-b border-rule px-4 py-3.5">
        <div>
          {/* Title — Inter 600 / 13px / -0.005em (NOT display font;
              spec §9: "panel titles stay body font"). */}
          <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-white">
            {title}
          </h3>
          {/* Subtitle: Inter 400 / 11px / steel / regular case. */}
          <div className="mt-0.5 text-[11px] text-steel">{eyebrow}</div>
        </div>
        {headerLink ? (
          <Link
            to={headerLink.to}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-steel transition-colors duration-base ease-out hover:text-white"
          >
            {headerLink.label}
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
          </Link>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-[12px] text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ul>
            {rows.map((r, i) => {
              const widthPct = maxValue > 0 ? (r.value / maxValue) * 100 : 0;
              return (
                <li
                  key={i}
                  className="grid grid-cols-[22px_1fr_auto] items-center gap-3 px-4 py-2.5 text-[13px] transition-colors duration-base ease-out hover:bg-white/[0.04]"
                >
                  {/* LEFT col — rank (mono) or avatar */}
                  {mode === "ranked" ? (
                    <span className="text-right font-mono text-[11px] text-steel">
                      {r.rank}
                    </span>
                  ) : (
                    r.avatarName && (
                      <Avatar
                        name={r.avatarName}
                        size="xs"
                        tint={avatarTint}
                      />
                    )
                  )}

                  {/* CENTER col — name + (avatar mode: progress bar; ranked mode: secondary) */}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">
                      {r.primary}
                    </div>
                    {mode === "ranked" ? (
                      <div className="truncate text-[11px] text-steel">
                        {r.secondary}
                      </div>
                    ) : (
                      // 3px progress bar per spec §9 — bg white/[0.04],
                      // inner = blue (talent) or steel (vendor).
                      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded bg-white/[0.04]">
                        <div
                          className={cn("h-full rounded", progressBarBg)}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* RIGHT col — stacked: amount on top, badge or secondary below.
                      Money in Unbounded (font-display) per user direction —
                      matches the Overview page title's face. */}
                  <div className="flex flex-col items-end gap-0.5 shrink-0 leading-tight">
                    <span className="tabular font-display text-[13px] font-bold text-white">
                      ${r.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                    {mode === "ranked" && r.badge ? (
                      // Late badge per spec §9 — bg rgba(248,113,113,0.14),
                      // colour overdue, padding 2px 6px, rounded-sm,
                      // font 700 / 10.5px / tabular / 0.04em.
                      <span className="tabular rounded-sm bg-[rgba(248,113,113,0.14)] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.04em] text-overdue">
                        {r.badge.text}
                      </span>
                    ) : (
                      <span className="text-[11px] text-steel">
                        {r.secondary}
                      </span>
                    )}
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
    // Spec §4: 32px chip recipe — bg ash, 1px rule, rounded-md,
    // padding 0 10px, calendar icon + year + chevron-down.
    <div className="relative inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[12px] text-white transition-colors duration-base ease-out focus-within:ring-1 focus-within:ring-electric">
      <Calendar className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      <span className="tabular">{value}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      {/* Native select absolutely positioned over the chip for click-handling */}
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
