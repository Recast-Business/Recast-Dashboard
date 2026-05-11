import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase L primitive: tiny inline line chart for KPI tiles.
 *
 * Pure SVG, no recharts overhead — just normalises an array of numbers
 * to a viewbox and draws a stroke + gradient fill. Designed to sit
 * below the display amount on a KpiTile (~120 × 32 px).
 *
 * Tone follows the brand status enum so the colour matches the delta
 * pill above it (paid green for inflow up, overdue red for outflow up,
 * etc.).
 */

const TONE_STROKE: Record<NonNullable<SparklineProps["tone"]>, string> = {
  paid: "stroke-paid",
  overdue: "stroke-overdue",
  partial: "stroke-partial",
  electric: "stroke-electric",
  muted: "stroke-steel",
};

const TONE_FILL: Record<NonNullable<SparklineProps["tone"]>, string> = {
  paid: "var(--rc-paid)",
  overdue: "var(--rc-overdue)",
  partial: "var(--rc-partial)",
  electric: "var(--rc-electric)",
  muted: "var(--rc-steel)",
};

// Omit the inherited `values` (string) prop from SVGAttributes —
// we use it for the data series, not the SVG <svg values=…> attr.
interface SparklineProps extends Omit<React.SVGAttributes<SVGSVGElement>, "values"> {
  values: number[];
  tone?: "paid" | "overdue" | "partial" | "electric" | "muted";
  width?: number;
  height?: number;
  /** When true, fills the area under the line with a subtle gradient. */
  filled?: boolean;
}

export const Sparkline = React.forwardRef<SVGSVGElement, SparklineProps>(
  (
    { values, tone = "muted", width = 120, height = 32, filled = true, className, ...rest },
    ref,
  ) => {
    if (values.length < 2) {
      // Not enough points for a line — render an empty placeholder so
      // the tile layout doesn't shift between data states.
      return (
        <svg
          ref={ref}
          width={width}
          height={height}
          className={cn("opacity-30", className)}
          {...rest}
        />
      );
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1; // avoid divide-by-zero on flat data
    const step = width / (values.length - 1);
    const yFor = (v: number) => height - ((v - min) / range) * height;

    const points = values.map((v, i) => `${i * step},${yFor(v)}`);
    const linePath = "M " + points.join(" L ");
    const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

    const gradientId = React.useId();

    return (
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("block", className)}
        preserveAspectRatio="none"
        {...rest}
      >
        {filled ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TONE_FILL[tone]} stopOpacity={0.3} />
              <stop offset="100%" stopColor={TONE_FILL[tone]} stopOpacity={0} />
            </linearGradient>
          </defs>
        ) : null}
        {filled ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        <path
          d={linePath}
          fill="none"
          className={TONE_STROKE[tone]}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  },
);
Sparkline.displayName = "Sparkline";
