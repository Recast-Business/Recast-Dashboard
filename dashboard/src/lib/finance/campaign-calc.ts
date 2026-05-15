/**
 * Campaign deal calculations.
 *
 * Locked specs (Phase F kickoff Q&A):
 *   • CTR is computed (clicks / views × 100), never stored.
 *   • "Hybrid" deal_type = CPM amount + a flat fee on top.
 *   • per_stream is dropped for v1 — schema may keep the column dormant.
 *   • CTV / Views / Displays / Clicks are tracked as informational metrics.
 *     Only `views` participates in the CPM gross calc.
 *   • Recast commission % = per-creator override if set, else campaign default.
 *   • Commission applies to gross (no platform fee like Telegram has).
 */

export type DealType = "cpm" | "flat_fee" | "hybrid";

export interface CampaignDealInputs {
  deal_type: DealType;
  cpm_rate?: number | null;        // dollars per 1,000 views
  flat_amount?: number | null;     // dollars
  views?: number | null;
  displays?: number | null;        // informational
  clicks?: number | null;          // informational, used for CTR
  /** Per-creator override; falls through to campaign default if null. */
  override_commission_pct?: number | null;
  /** Campaign-level default commission % (used when override is null). */
  default_commission_pct: number;
}

export interface CampaignDealCalc {
  cpm_gross: number;       // calc'd CPM portion
  flat_gross: number;      // flat portion
  gross: number;           // total = cpm + flat depending on type
  views: number;
  displays: number;
  clicks: number;
  ctr_pct: number;         // (clicks / views) × 100 — 0 when views = 0
  effective_commission_pct: number;  // resolved (override || default)
  recast_commission: number;
  creator_take_home: number;
}

export function calcCampaignDeal(input: CampaignDealInputs): CampaignDealCalc {
  const views = nonneg(input.views ?? 0);
  const displays = nonneg(input.displays ?? 0);
  const clicks = nonneg(input.clicks ?? 0);

  const cpmRate = nonneg(input.cpm_rate ?? 0);
  const flatAmount = nonneg(input.flat_amount ?? 0);

  // CPM portion
  const cpmGross = round2((views / 1000) * cpmRate);

  // Hybrid combines CPM + flat. Flat-only and CPM-only zero out the other.
  let gross: number;
  let cpmContribution: number;
  let flatContribution: number;
  switch (input.deal_type) {
    case "cpm":
      cpmContribution = cpmGross;
      flatContribution = 0;
      gross = cpmContribution;
      break;
    case "flat_fee":
      cpmContribution = 0;
      flatContribution = flatAmount;
      gross = flatContribution;
      break;
    case "hybrid":
      cpmContribution = cpmGross;
      flatContribution = flatAmount;
      gross = round2(cpmContribution + flatContribution);
      break;
  }

  const effectivePct =
    input.override_commission_pct != null
      ? input.override_commission_pct
      : input.default_commission_pct;

  const recastCommission = round2(gross * (effectivePct / 100));
  const creatorTakeHome = round2(gross - recastCommission);

  // CTR: only meaningful when views > 0
  const ctrPct = views > 0 ? round2((clicks / views) * 100) : 0;

  return {
    cpm_gross: cpmContribution,
    flat_gross: flatContribution,
    gross,
    views,
    displays,
    clicks,
    ctr_pct: ctrPct,
    effective_commission_pct: effectivePct,
    recast_commission: recastCommission,
    creator_take_home: creatorTakeHome,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Ad Overlay deals
// ─────────────────────────────────────────────────────────────────────
//
// Lives outside the DealType enum because the inputs don't overlap with
// the views/displays/clicks model — overlay revenue scales with CCV and
// airtime, not page views. CPM + ad frequency come from the campaign;
// CCV + airtime come from the per-creator-per-month period cell.
//
//   per ad airing = (CCV / 1000) × CPM
//   per hour      = per ad airing × ads/hr
//   gross         = per hour × (airtime_minutes / 60)

export interface AdOverlayInputs {
  /** $ per 1,000 viewers per ad airing — campaign-level. */
  cpm_rate: number | null | undefined;
  /** Ads played per streaming hour — campaign-level. */
  ad_frequency_per_hr: number | null | undefined;
  /** Average concurrent viewer count during the month — per-creator-period. */
  ccv: number | null | undefined;
  /** Total streamed minutes in the month — per-creator-period. */
  airtime_minutes: number | null | undefined;
  /** Per-creator override; falls through to campaign default if null. */
  override_commission_pct?: number | null;
  /** Campaign-level default commission % (used when override is null). */
  default_commission_pct: number;
}

export interface AdOverlayCalc {
  per_ad: number;
  per_hour: number;
  gross: number;
  effective_commission_pct: number;
  recast_commission: number;
  creator_take_home: number;
}

export function calcAdOverlay(input: AdOverlayInputs): AdOverlayCalc {
  const cpm = nonneg(input.cpm_rate ?? 0);
  const adsPerHr = nonneg(input.ad_frequency_per_hr ?? 0);
  const ccv = nonneg(input.ccv ?? 0);
  const minutes = nonneg(input.airtime_minutes ?? 0);

  const perAd = round2((ccv / 1000) * cpm);
  const perHour = round2(perAd * adsPerHr);
  const gross = round2(perHour * (minutes / 60));

  const effectivePct =
    input.override_commission_pct != null
      ? input.override_commission_pct
      : input.default_commission_pct;

  const recastCommission = round2(gross * (effectivePct / 100));
  const creatorTakeHome = round2(gross - recastCommission);

  return {
    per_ad: perAd,
    per_hour: perHour,
    gross,
    effective_commission_pct: effectivePct,
    recast_commission: recastCommission,
    creator_take_home: creatorTakeHome,
  };
}

// ─────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nonneg(n: number): number {
  return Math.max(0, Number.isFinite(n) ? n : 0);
}
