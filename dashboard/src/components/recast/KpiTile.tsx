import * as React from "react";
import { cn } from "@/lib/utils";
import { EyebrowLabel } from "./EyebrowLabel";
import { MoneyCell } from "./MoneyCell";
import { Sparkline } from "./Sparkline";

/**
 * Phase L primitive: the 4-up KPI tile.
 *
 * Layout (matches the Claude Design Overview mockup):
 *
 *   ┌─ tile ────────────────────────────┐
 *   │  ↗ EYEBROW LABEL    [+12.4%]      │  ← icon + label, deltaPct pill right
 *   │                                   │
 *   │  $118,420.00                      │  ← display amount (tinted by tone)
 *   │                                   │
 *   │  ╱╲    ╱╲                         │  ← sparkline (12-month series)
 *   │     ╲ ╱  ╲                        │
 *   │                                   │
 *   │  vs $105,400 Jun                  │  ← vs comparison line (steel)
 *   └───────────────────────────────────┘
 *
 * Tone enum:
 *   default  → neutral (Inflow/Outflow/Net at rest)
 *   paid     → green (positive emphasis)
 *   overdue  → red (negative emphasis)
 *   partial  → amber (warning — used on Outstanding when items > 0)
 *
 * See dashboard/docs/DESIGN.md "KPI tile" recipe.
 */

interface KpiTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  label: string;
  amount: number;
  /** Lucide icon shown to the left of the eyebrow label. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Inline pill next to the eyebrow, e.g. { tone: "paid", text: "+12.4%" }. */
  deltaPct?: {
    tone?: "paid" | "overdue" | "muted" | "partial";
    text: string;
  };
  /** Comparison line below the amount, e.g. "vs $105,400 Jun". */
  vs?: string;
  /** Optional secondary metadata line. */
  meta?: string;
  /**
   * Mini line chart below the amount. Pass 12 monthly values; the
   * component normalises them to the available width.
   */
  sparkline?: {
    values: number[];
    tone?: "paid" | "overdue" | "partial" | "electric" | "muted";
  };
  /** Render as compact tile (smaller display, less padding). */
  compact?: boolean;
  /**
   * Override the amount's tone colour. Used on the Outstanding tile
   * when something is overdue (turns the entire $ display amber).
   */
  tone?: "default" | "paid" | "overdue" | "partial";
}

const deltaToneClass: Record<NonNullable<KpiTileProps["deltaPct"]>["tone"] & string, string> = {
  paid: "bg-paid-tint text-paid",
  overdue: "bg-overdue-tint text-overdue",
  partial: "bg-partial-tint text-partial",
  muted: "bg-unpaid-tint text-steel",
};

export const KpiTile = React.forwardRef<HTMLDivElement, KpiTileProps>(
  (
    { label, amount, icon: Icon, deltaPct, vs, meta, sparkline, compact, tone = "default", className, ...rest },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        // Card recipe: bg-card (resolves to ash in dark) + hairline.
        "rounded-lg border bg-card",
        compact ? "p-tile-sm" : "p-tile-md",
        // Per canonical spec: top-edge accent is a 1px rule, not 2px.
        // (Spec §6: ".rc-kpi--good { border-top: 1px solid var(--paid) }")
        tone === "partial" && "border-t border-t-partial",
        tone === "overdue" && "border-t border-t-overdue",
        tone === "paid" && "border-t border-t-paid",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-steel" /> : null}
          <EyebrowLabel className="truncate">{label}</EyebrowLabel>
        </div>
        {deltaPct ? (
          <span
            className={cn(
              // KPI delta pill per canonical spec §6: 11px / 600 /
              // tabular / 2px×6px padding. Not the wider-tracked eyebrow.
              "tabular shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold leading-none",
              deltaToneClass[deltaPct.tone ?? "muted"],
            )}
          >
            {deltaPct.text}
          </span>
        ) : null}
      </div>
      <div className={cn("flex items-baseline", compact ? "mt-1" : "mt-2")}>
        {/* Per spec: KPI value is 30px (text-kpi), not 36px (text-display).
            That keeps page-title > KPI value in the visual hierarchy. */}
        <MoneyCell amount={amount} size={compact ? "h2" : "kpi"} tone={tone === "default" ? "default" : tone} />
      </div>
      {sparkline ? (
        <div className="mt-2 -mx-1">
          <Sparkline
            values={sparkline.values}
            tone={sparkline.tone ?? "electric"}
            width={140}
            height={28}
            className="w-full"
          />
        </div>
      ) : null}
      {vs ? (
        <div className={cn("text-small text-steel", sparkline ? "mt-1" : "mt-1")}>{vs}</div>
      ) : null}
      {meta ? (
        <div className={cn("text-small text-steel", vs ? "mt-0.5" : "mt-1")}>{meta}</div>
      ) : null}
    </div>
  ),
);
KpiTile.displayName = "KpiTile";
