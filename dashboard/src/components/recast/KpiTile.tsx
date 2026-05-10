import * as React from "react";
import { cn } from "@/lib/utils";
import { EyebrowLabel } from "./EyebrowLabel";
import { MoneyCell } from "./MoneyCell";

/**
 * Phase L primitive: the 4-up KPI tile.
 *
 * Layout (matches the Claude Design Overview mockup):
 *
 *   ┌─ tile ──────────────────────────┐
 *   │  EYEBROW LABEL    +12.4%        │  ← deltaPct sits inline with eyebrow
 *   │                                 │
 *   │  $118,420.00                    │  ← display amount, tabular
 *   │                                 │
 *   │  vs $105,400 Jun                │  ← vs comparison line (steel)
 *   │  6 items · oldest 12d           │  ← optional meta line
 *   └─────────────────────────────────┘
 *
 * The delta colour uses the brand status enum (paid/overdue) — never
 * shadcn semantic green/red. Outflow tiles invert the sign mapping
 * (negative pct = paid green = good = less spending).
 *
 * See dashboard/docs/DESIGN.md "KPI tile" recipe.
 */

interface KpiTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Eyebrow label above the number, e.g. "Inflow this month". */
  label: string;
  /** Primary amount. Pass a number; MoneyCell handles formatting. */
  amount: number;
  /**
   * Inline percentage badge next to the eyebrow label, e.g.
   *   { tone: "paid", text: "+12.4%" }
   */
  deltaPct?: {
    tone?: "paid" | "overdue" | "muted";
    text: string;
  };
  /** Comparison line below the amount, e.g. "vs $105,400 Jun". */
  vs?: string;
  /** Optional secondary metadata line (e.g. "Oldest 12 d"). */
  meta?: string;
  /** Render as compact tile (smaller display, less padding). */
  compact?: boolean;
}

const toneClass: Record<NonNullable<KpiTileProps["deltaPct"]>["tone"] & string, string> = {
  paid: "text-paid",
  overdue: "text-overdue",
  muted: "text-steel",
};

export const KpiTile = React.forwardRef<HTMLDivElement, KpiTileProps>(
  ({ label, amount, deltaPct, vs, meta, compact, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card",
        compact ? "p-tile-sm" : "p-tile-md",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <EyebrowLabel>{label}</EyebrowLabel>
        {deltaPct ? (
          <span className={cn("tabular text-eyebrow", toneClass[deltaPct.tone ?? "muted"])}>
            {deltaPct.text}
          </span>
        ) : null}
      </div>
      <div className={cn("flex items-baseline", compact ? "mt-1" : "mt-2")}>
        <MoneyCell amount={amount} size={compact ? "h2" : "display"} />
      </div>
      {vs ? (
        <div className="mt-1 text-small text-steel">{vs}</div>
      ) : null}
      {meta ? (
        <div className={cn("text-small text-steel", vs ? "mt-0.5" : "mt-1")}>{meta}</div>
      ) : null}
    </div>
  ),
);
KpiTile.displayName = "KpiTile";
