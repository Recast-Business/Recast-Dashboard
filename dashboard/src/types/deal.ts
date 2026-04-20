export type DealComponent =
  | FlatFeeComponent
  | PerPostComponent
  | PerStreamComponent
  | RevShareComponent
  | TieredBonusComponent
  | DailyLogComponent
  | WeeklyCapComponent
  | CPMComponent;

export interface FlatFeeComponent {
  type: "flat_fee";
  label?: string;
  amount: number;
}

export interface PerPostComponent {
  type: "per_post";
  label?: string;
  rate: number;
  posts: number;
}

export interface PerStreamComponent {
  type: "per_stream";
  label?: string;
  rate: number;
  streams: number;
}

export interface RevShareComponent {
  type: "rev_share";
  label?: string;
  percent: number;
  revenue: number;
  minGuarantee?: number;
}

export interface TieredBonusTier {
  threshold: number;
  bonus: number;
}

export interface TieredBonusComponent {
  type: "tiered_bonus";
  label?: string;
  tiers: TieredBonusTier[];
  metric: number;
  mode?: "highest" | "cumulative";
}

export interface DailyLogComponent {
  type: "daily_log";
  label?: string;
  ratePerDay: number;
  days: number;
}

export interface WeeklyCapComponent {
  type: "weekly_cap";
  label?: string;
  ratePerHour: number;
  hours: number;
  weeklyCap: number;
  rolloverWeeks?: number;
  priorRollover?: number;
}

export interface CPMComponent {
  type: "cpm";
  label?: string;
  rate: number;
  impressions: number;
}

export type DealComponentType = DealComponent["type"];

export interface EarningsBreakdownItem {
  type: DealComponentType;
  label: string;
  amount: number;
  detail?: string;
}

export interface EarningsResult {
  gross: number;
  breakdown: EarningsBreakdownItem[];
  commission: number;
  net: number;
}

export interface ManualInputs {
  override_gross?: number | null;
  override_commission?: number | null;
  note?: string | null;
}

export const DEAL_COMPONENT_LABELS: Record<DealComponentType, string> = {
  flat_fee: "Flat fee",
  per_post: "Per post",
  per_stream: "Per stream",
  rev_share: "Revenue share",
  tiered_bonus: "Tiered bonus",
  daily_log: "Daily log",
  weekly_cap: "Weekly cap",
  cpm: "CPM",
};
