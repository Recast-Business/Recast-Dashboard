import * as React from "react";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase L primitive: tabular currency rendering.
 *
 * Always tabular-nums so columns line up. The decimal portion (.00)
 * renders smaller and steel-coloured to keep the integer dollar-amount
 * visually dominant — matches the cash-flow KPI tile recipe.
 *
 * Sign placement: `−` (minus, U+2212) prefix in front of the dollar
 * sign for negative amounts, never after. Outflow / refund / fee.
 */

export interface MoneyCellProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Raw dollar amount. Pass a number, not a pre-formatted string. */
  amount: number;
  /**
   * "display" → 36px (page-title hero number)
   * "kpi"     → 30px (KPI tile value, per spec recipe)
   * "h2"      → 24px (panel heading)
   * "body"    → 14px (default — cells, lists)
   * "small"   → 12px (footnote, sub-line)
   */
  size?: "display" | "kpi" | "h2" | "body" | "small";
  /**
   * If true, renders `.00` decimals smaller and steel-coloured.
   * Default true on display/h2, false on body/small (too noisy in cells).
   */
  splitDecimals?: boolean;
  /** Visual emphasis colour. */
  tone?: "default" | "muted" | "paid" | "overdue" | "partial";
}

// Display sizes (display / kpi / h2) inherit weight from the size token
// itself — Unbounded 800/700. Body sizes (body / small) need an explicit
// font-medium bump because the spec says all $ figures inline are
// Inter 500 with tabular-nums, but text-body alone is Inter 400.
const sizeClass: Record<NonNullable<MoneyCellProps["size"]>, string> = {
  display: "text-display",
  kpi: "text-kpi",
  h2: "text-h2",
  body: "text-body font-medium",
  small: "text-small font-medium",
};

const toneClass: Record<NonNullable<MoneyCellProps["tone"]>, string> = {
  default: "text-foreground",
  muted: "text-steel",
  paid: "text-paid",
  overdue: "text-overdue",
  partial: "text-partial",
};

export const MoneyCell = React.forwardRef<HTMLSpanElement, MoneyCellProps>(
  (
    { amount, size = "body", splitDecimals, tone = "default", className, ...rest },
    ref,
  ) => {
    const split = splitDecimals ?? (size === "display" || size === "kpi" || size === "h2");
    const formatted = formatUSD(amount); // "$1,234.56" or "-$1,234.56"
    // Replace ASCII hyphen with proper minus and split into integer/decimal.
    const normalised = formatted.replace(/^-/, "−");
    const [intPart, decPart] = normalised.split(".");

    if (!split || !decPart) {
      return (
        <span
          ref={ref}
          // Per user direction: every $ figure renders in Unbounded
          // (the same face as the "Overview" page title), not Inter.
          // `font-display` is a Tailwind utility — it cascades AFTER
          // the index.css base rule that maps body sizes to Inter,
          // so it wins.
          className={cn("tabular font-display", sizeClass[size], toneClass[tone], className)}
          {...rest}
        >
          {normalised}
        </span>
      );
    }

    // Decimal-cents recipe per the canonical spec:
    //   • on KPI / display sizes (the "Stripe large + small" pattern):
    //     18px / 600 / rgba(255,255,255,0.5) — distinct chunky size
    //   • on h2 size: 12px / 500 / steel — proportional
    //   • body / small: never split (too noisy in cells)
    const isLargeSplit = size === "display" || size === "kpi";
    const decimalClass = isLargeSplit
      ? "text-[18px] font-semibold leading-none text-white/50"
      : "text-small text-steel";

    return (
      <span
        ref={ref}
        // Always Unbounded — see note above.
        className={cn("tabular inline-flex items-baseline gap-0.5 font-display", sizeClass[size], toneClass[tone], className)}
        {...rest}
      >
        <span>{intPart}</span>
        <span className={decimalClass}>.{decPart}</span>
      </span>
    );
  },
);
MoneyCell.displayName = "MoneyCell";
