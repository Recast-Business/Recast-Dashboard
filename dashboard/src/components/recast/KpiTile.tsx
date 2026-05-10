import * as React from "react";
import { cn } from "@/lib/utils";
import { EyebrowLabel } from "./EyebrowLabel";
import { MoneyCell } from "./MoneyCell";

/**
 * Phase L primitive: the 4-up KPI tile.
 *
 * Composition: eyebrow label + tabular display amount + delta line.
 * Used on the Overview page (Inflow / Outflow / Net / Outstanding) and
 * in compact form on Vendor / House detail pages (YTD totals strip).
 *
 * The delta colour is intentionally not `text-success` / `text-destructive`
 * — those are shadcn semantic. We use the brand status enum (paid/overdue)
 * so the language stays consistent with invoice colouring.
 *
 * See dashboard/docs/DESIGN.md "KPI tile" recipe.
 */

interface KpiTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Eyebrow label above the number, e.g. "Inflow this month". */
  label: string;
  /** Primary amount. Pass a number; MoneyCell handles formatting. */
  amount: number;
  /**
   * Comparison line shown below the amount, e.g.
   *  { tone: "paid", text: "+12.4% vs $105,400 Jun" }
   */
  delta?: {
    tone?: "paid" | "overdue" | "muted";
    text: string;
  };
  /** Optional secondary metadata line above the delta (e.g. "Oldest 12 d"). */
  meta?: string;
  /** Render as compact tile (smaller display, less padding). */
  compact?: boolean;
}

const toneClass: Record<NonNullable<KpiTileProps["delta"]>["tone"] & string, string> = {
  paid: "text-paid",
  overdue: "text-overdue",
  muted: "text-steel",
};

export const KpiTile = React.forwardRef<HTMLDivElement, KpiTileProps>(
  ({ label, amount, delta, meta, compact, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card",
        compact ? "p-tile-sm" : "p-tile-md",
        className,
      )}
      {...rest}
    >
      <EyebrowLabel>{label}</EyebrowLabel>
      <div className={cn("flex items-baseline", compact ? "mt-1" : "mt-2")}>
        <MoneyCell amount={amount} size={compact ? "h2" : "display"} />
      </div>
      {meta ? (
        <div className="mt-1 text-small text-steel">{meta}</div>
      ) : null}
      {delta ? (
        <div className={cn("mt-1 text-small tabular", toneClass[delta.tone ?? "muted"])}>
          {delta.text}
        </div>
      ) : null}
    </div>
  ),
);
KpiTile.displayName = "KpiTile";
