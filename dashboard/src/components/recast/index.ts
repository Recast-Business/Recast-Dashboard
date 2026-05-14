/**
 * Phase L: Recast design-system primitives.
 *
 * These are the domain-specific primitives layered on top of shadcn
 * (Card / Button / Badge / Dialog / etc.). Reach for these first when
 * building new UI; only fall back to bare shadcn when the thing you're
 * building isn't one of: status, money, KPI, invoice cell, eyebrow.
 *
 * See dashboard/docs/DESIGN.md for usage rules.
 */

export { EyebrowLabel } from "./EyebrowLabel";
export { MoneyCell, type MoneyCellProps } from "./MoneyCell";
export { StatusPill, type PillStatus } from "./StatusPill";
export { KpiTile } from "./KpiTile";
export { InvoiceCell } from "./InvoiceCell";
export { Avatar } from "./Avatar";
export { Sparkline } from "./Sparkline";
export {
  PageHeader,
  MetricStrip,
  type MetricTile,
  type MetricTone,
} from "./MetricStrip";
