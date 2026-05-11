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
 *
 * Round 3 Q1 + Q7 (migration 0035): the canonical commission column is
 * now `creators.commission_tiers` (new shape, threshold = "tier ENDS at",
 * null on the last tier = "and above"). The legacy
 * `commission_pct_by_platform` column stays readable as a safety net
 * during the cutover window — `tiersFromProfile` reads new first,
 * translates legacy on the fly otherwise.
 *
 * Per-creator `commission_uses_cliff` flag (default false) chooses the
 * math mode:
 *   • Progressive (default): each tier bills its own slice (income-
 *     bracket style). Example: tiers [{threshold:10K, pct:30},
 *     {threshold:null, pct:20}] on gross $15K = first $10K × 30% +
 *     remaining $5K × 20% = $4,000.
 *   • Cliff (legacy): the tier whose range contains gross applies its
 *     pct to the WHOLE gross. Same data, same $15K = $15K × 20% =
 *     $3,000.
 * The flag is per-creator, all-platforms — Gustavo's call (one toggle
 * per contract era, not per-platform).
 */

export interface CommissionTier {
  /**
   * Round 3 shape: dollar threshold this tier ends at (inclusive).
   * null = applies forever (terminal tier). Tier 0's implicit start
   * is $0; tier i's start is tier (i-1)'s threshold.
   *
   * Example tiers list:
   *   [{threshold: 10000, pct: 30}, {threshold: 50000, pct: 25}, {threshold: null, pct: 20}]
   * Reads as: $0–10K @ 30%, $10K–50K @ 25%, $50K+ @ 20%.
   */
  threshold: number | null;
  /** Recast's cut on this tier, 0–100. */
  pct: number;
}

export type CommissionMode = "progressive" | "cliff";

// ─────────────────────────────────────────────────────────────────────
// Core tier math — both modes
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute Recast's commission dollars from a tier table and gross.
 * Mode defaults to progressive (Gustavo R3 decision B); pass "cliff"
 * for grandfathered creators (commission_uses_cliff = true).
 *
 * Returns 0 when tiers is null/empty/zero gross.
 */
export function commissionDollarsFromTiers(
  gross: number,
  tiers: CommissionTier[] | null | undefined,
  mode: CommissionMode = "progressive",
): number {
  if (!tiers || tiers.length === 0 || gross <= 0) return 0;
  return mode === "cliff"
    ? commissionDollarsCliff(gross, tiers)
    : commissionDollarsProgressive(gross, tiers);
}

/** Progressive (income-bracket) — each tier bills its own slice. */
function commissionDollarsProgressive(
  gross: number,
  tiers: CommissionTier[],
): number {
  const sorted = sortTiersAscending(tiers);
  let remaining = gross;
  let prevThreshold = 0;
  let total = 0;
  for (const tier of sorted) {
    if (remaining <= 0) break;
    const sliceEnd = tier.threshold === null ? Infinity : tier.threshold;
    const sliceWidth = sliceEnd - prevThreshold;
    const slice = Math.min(remaining, sliceWidth);
    total += slice * (tier.pct / 100);
    remaining -= slice;
    prevThreshold = sliceEnd;
  }
  return round2(total);
}

/** Cliff — find the tier whose range contains gross, apply pct to whole. */
function commissionDollarsCliff(
  gross: number,
  tiers: CommissionTier[],
): number {
  const sorted = sortTiersAscending(tiers);
  // Walk tiers in order; the first one whose end-threshold ≥ gross
  // is the bucket gross falls into. (Tier i covers (prev.threshold,
  // sorted[i].threshold]; gross sits inside if gross > prev AND
  // gross ≤ sorted[i].threshold.) Null threshold = +∞, so the
  // terminal tier always catches whatever's left.
  for (const tier of sorted) {
    const sliceEnd = tier.threshold === null ? Infinity : tier.threshold;
    if (gross <= sliceEnd) {
      return round2(gross * (tier.pct / 100));
    }
  }
  // Defensive — should be unreachable if any tier has threshold null.
  // Fall back to the last tier's pct.
  return round2(gross * (sorted[sorted.length - 1].pct / 100));
}

/**
 * Derive a single blended % from a tier table. Lets callers that
 * multiply against a separate commission base (e.g. Telegram on net +
 * top-up, OnlyFans on net when basis=net) keep using the existing
 * "effective pct × base" pattern — works under both modes.
 *
 * Returns null when no tiers supplied.
 */
export function effectivePctFromTiers(
  gross: number,
  tiers: CommissionTier[] | null | undefined,
  mode: CommissionMode = "progressive",
): number | null {
  if (!tiers || tiers.length === 0) return null;
  if (gross <= 0) {
    // Edge: no gross to slice. Return the FIRST tier's rate so a
    // "what would a $1 trial gross net me?" preview doesn't divide
    // by zero.
    const sorted = sortTiersAscending(tiers);
    return sorted[0].pct;
  }
  const dollars = commissionDollarsFromTiers(gross, tiers, mode);
  return (dollars / gross) * 100;
}

/** Sort tiers ascending by threshold; null threshold sorts last. */
function sortTiersAscending(tiers: CommissionTier[]): CommissionTier[] {
  return [...tiers].sort((a, b) => {
    if (a.threshold === null) return 1;
    if (b.threshold === null) return -1;
    return a.threshold - b.threshold;
  });
}

// ─────────────────────────────────────────────────────────────────────
// tiersFromProfile — single read path
// ─────────────────────────────────────────────────────────────────────

/**
 * Read a creator's tier table for one platform. Tries the canonical
 * column (commission_tiers, new shape) first; if empty, falls back to
 * the legacy column (commission_pct_by_platform) and translates its
 * shape on the fly.
 *
 * The legacy column stores threshold as "tier STARTS at" (and uses a
 * flat number for single-rate creators); we translate to the new
 * "tier ENDS at" shape so downstream math works on one shape only.
 *
 * Returns null when neither column has data for this platform.
 */
export function tiersFromProfile(
  creator:
    | {
        commission_tiers?: unknown;
        commission_pct_by_platform?: unknown;
      }
    | null
    | undefined,
  platform: "onlyfans" | "telegram" | "efuse",
): CommissionTier[] | null {
  if (!creator) return null;

  // 1. New canonical column.
  const canonical = creator.commission_tiers;
  if (canonical && typeof canonical === "object") {
    const v = (canonical as Record<string, unknown>)[platform];
    if (Array.isArray(v) && v.length > 0) {
      const out: CommissionTier[] = [];
      for (const t of v) {
        if (
          typeof t !== "object" ||
          t === null ||
          typeof (t as { pct?: unknown }).pct !== "number"
        ) {
          continue;
        }
        const rawT = (t as { threshold?: unknown }).threshold;
        const threshold =
          rawT === null
            ? null
            : typeof rawT === "number"
              ? rawT
              : null;
        out.push({ threshold, pct: (t as { pct: number }).pct });
      }
      if (out.length > 0) return out;
    }
  }

  // 2. Legacy fallback — translate "starts at" → "ends at".
  const legacy = creator.commission_pct_by_platform;
  if (!legacy || typeof legacy !== "object") return null;
  const v = (legacy as Record<string, unknown>)[platform];
  if (v == null) return null;

  // 2a. Flat number → single-tier covering everything.
  if (typeof v === "number" && Number.isFinite(v)) {
    return [{ threshold: null, pct: v }];
  }

  // 2b. Legacy tier array (starts-at). Sort ascending by start, then
  //     translate position i → {threshold: next.start, pct: this.pct}
  //     with the last position getting threshold:null.
  if (Array.isArray(v)) {
    const cleaned: Array<{ threshold: number; pct: number }> = [];
    for (const t of v) {
      if (
        typeof t === "object" &&
        t !== null &&
        typeof (t as { threshold?: unknown }).threshold === "number" &&
        typeof (t as { pct?: unknown }).pct === "number"
      ) {
        cleaned.push({
          threshold: (t as { threshold: number }).threshold,
          pct: (t as { pct: number }).pct,
        });
      }
    }
    if (cleaned.length === 0) return null;
    cleaned.sort((a, b) => a.threshold - b.threshold);
    const out: CommissionTier[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      const nextThreshold =
        i + 1 < cleaned.length ? cleaned[i + 1].threshold : null;
      out.push({ threshold: nextThreshold, pct: cleaned[i].pct });
    }
    return out;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────────────────────────────

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
  recast_commission_pct: number;  // e.g. 20 for 20% (used when tiers is null/empty)
  commission_basis: "gross" | "net";
  min_guarantee?: number | null;  // null = no MG
  /** Optional tier table from the creator's profile. When present,
   *  overrides recast_commission_pct via the chosen commission mode. */
  tiers?: CommissionTier[] | null;
  /** Round 3 Q1 (migration 0035): "progressive" (default) or "cliff"
   *  for grandfathered creators. Read from creator.commission_uses_cliff. */
  commissionMode?: CommissionMode;
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
  // Tiers, if present, are evaluated against the GROSS revenue —
  // Gustavo's monthly threshold is "how much did the creator make
  // this month", not "how much was Recast's base after splits".
  const mode = input.commissionMode ?? "progressive";
  const tieredPct = effectivePctFromTiers(gross, input.tiers, mode);
  const effectivePct = tieredPct ?? input.recast_commission_pct;
  const recastCommission = round2(baseForCommission * (effectivePct / 100));

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
// OnlyFans
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
  recast_pct: number;             // e.g. 35 for 35% (used when tiers is null/empty)
  basis: "gross" | "net";
  /** Optional tier table from the creator's profile. */
  tiers?: CommissionTier[] | null;
  /** Round 3 Q1: "progressive" (default) or "cliff" for grandfathered
   *  creators. Read from creator.commission_uses_cliff. */
  commissionMode?: CommissionMode;
}

export function calcOFPeriod(input: OFPeriodInput): OFPeriodCalc {
  const gross = round2(Math.max(0, input.gross_revenue));
  const net =
    input.net_revenue != null
      ? round2(Math.max(0, input.net_revenue))
      : gross;

  const baseForCommission = input.basis === "gross" ? gross : net;
  const mode = input.commissionMode ?? "progressive";
  const tieredPct = effectivePctFromTiers(gross, input.tiers, mode);
  const effectivePct = tieredPct ?? input.recast_pct;
  const recastCommission = round2(baseForCommission * (effectivePct / 100));
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
