/**
 * Telegram + OnlyFans income calculations.
 *
 * Locked specs (from Gustavo overhaul Q&A):
 *   • Telegram net is fixed at 50% of gross (the platform takes 50% before commission).
 *   • Telegram MG qualifier: net >= 50% of MG → creator qualifies for top-up.
 *   • Top-up amount: max(0, MG - net) when qualified.
 *   • Recast commission applies to (net + top-up), NOT just net.
 *
 * OnlyFans is simpler — Recast takes a % of gross or net depending on the deal,
 * the rest is the creator's "girls share". No MG.
 */

const TELEGRAM_PLATFORM_NET_RATIO = 0.5;
const TELEGRAM_MG_QUALIFIER_RATIO = 0.5;

export interface TelePeriodCalc {
  gross_revenue: number;
  net_revenue: number;            // typically 0.5 × gross
  qualified_for_mg: boolean;
  mg_top_up: number;              // amount Telegram tops the creator up to MG
  recast_commission: number;      // Recast's cut, applied to (net + top-up)
  creator_take_home: number;      // (net + top-up) − recast_commission
}

export interface TelePeriodInput {
  gross_revenue: number;
  net_revenue?: number;           // optional override; defaults to 50% of gross
  recast_commission_pct: number;  // e.g. 20 for 20%
  commission_basis: "gross" | "net";
  min_guarantee?: number | null;  // null = no MG
}

export function calcTelePeriod(input: TelePeriodInput): TelePeriodCalc {
  const gross = round2(Math.max(0, input.gross_revenue));
  const net =
    input.net_revenue != null
      ? round2(Math.max(0, input.net_revenue))
      : round2(gross * TELEGRAM_PLATFORM_NET_RATIO);

  const mg = input.min_guarantee ?? 0;
  const mgQualifier = mg * TELEGRAM_MG_QUALIFIER_RATIO;
  const qualified = mg > 0 && net >= mgQualifier;
  const topUp = qualified ? round2(Math.max(0, mg - net)) : 0;

  const baseForCommission =
    input.commission_basis === "gross" ? gross : round2(net + topUp);
  const recastCommission = round2(baseForCommission * (input.recast_commission_pct / 100));

  const creatorTakeHome = round2(net + topUp - recastCommission);

  return {
    gross_revenue: gross,
    net_revenue: net,
    qualified_for_mg: qualified,
    mg_top_up: topUp,
    recast_commission: recastCommission,
    creator_take_home: creatorTakeHome,
  };
}

// ─────────────────────────────────────────────────────────────────────

export interface OFPeriodCalc {
  gross_revenue: number;
  net_revenue: number;
  recast_commission: number;
  girls_share: number;            // creator's share after Recast cut
}

export interface OFPeriodInput {
  gross_revenue: number;
  net_revenue?: number;           // optional override; defaults equal to gross
  recast_pct: number;             // e.g. 35 for 35%
  basis: "gross" | "net";
}

export function calcOFPeriod(input: OFPeriodInput): OFPeriodCalc {
  const gross = round2(Math.max(0, input.gross_revenue));
  const net =
    input.net_revenue != null
      ? round2(Math.max(0, input.net_revenue))
      : gross;

  const baseForCommission = input.basis === "gross" ? gross : net;
  const recastCommission = round2(baseForCommission * (input.recast_pct / 100));
  const girlsShare = round2(net - recastCommission);

  return {
    gross_revenue: gross,
    net_revenue: net,
    recast_commission: recastCommission,
    girls_share: girlsShare,
  };
}

// ─────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
