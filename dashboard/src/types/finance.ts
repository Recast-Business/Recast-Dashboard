// Phase A — TypeScript types for the new finance schema.
// Mirrors dashboard/supabase/migrations/0020_finance_overhaul.sql.
// Will be merged into database.ts in Phase F when the UI is wired up.

export type Division = "onlyfans" | "telegram" | "efuse";

export type VendorKind =
  | "vendor"
  | "talent_we_pay"
  | "talent_that_pays_us"
  | "utility"
  | "employee"
  | "credit_card_account";

export type PaymentMethod =
  | "auto_pay"
  | "paypal"
  | "domestic_wire"
  | "international_transfer"
  | "bank_ach"
  | "zelle"
  | "invoice_link"
  | "website_link"
  | "credit_card";

export type PaymentStatusV2 = "unpaid" | "partial" | "paid" | "overdue";

export type CampaignStatusV2 =
  | "pending"
  | "active"
  | "awaiting_payment"
  | "overdue"
  | "completed";

export type CommissionBasis = "gross" | "net";

// ─────────────────────────────────────────────────────────────────────
// Round 3 (Gustavo): Talent profile — tiered commission + agreements
// ─────────────────────────────────────────────────────────────────────

/**
 * Platform slug used as a key in commission_tiers and as the value in
 * creator_agreements.platform. Matches the check constraint on
 * creator_agreements (migration 0043) — note that the Ad Overlay
 * platform slug is "efuse" (historical naming from the eFuse era);
 * the dashboard renders "Overlay" / "Ad Overlay" as the display label.
 *
 * R5 Sweep 3d: dropped "overlay" from this union — it was a UI-only
 * slot label from the deprecated agreement_links map and never made
 * it into the new schema. Use "efuse" instead.
 */
export type TalentPlatform = "onlyfans" | "telegram" | "efuse" | "deal" | "other";

/**
 * A single commission tier (per platform). Tiers ascend by threshold;
 * the last tier in the array should have threshold:null (= "and above").
 * Progressive — each tier applies to its slice only (income-tax-bracket style).
 *
 * Example single-rate: [{ threshold: null, pct: 25 }]
 * Example tiered:      [{ threshold: 100000, pct: 25 }, { threshold: null, pct: 20 }]
 */
export interface CommissionTier {
  /** Dollar threshold this tier ends at (inclusive). null = applies forever. */
  threshold: number | null;
  /** Commission percentage applied to the slice in this tier. */
  pct: number;
}

/**
 * R5 Sweep 3a (Gustavo, T3): commission tiers are now per-page within
 * each platform. Shape: { platform: { page_name: tiers[] } }
 *
 * Example:
 *   {
 *     onlyfans: {
 *       "Charlotte VIP": [{ threshold: 100000, pct: 25 }, { threshold: null, pct: 20 }],
 *       "Charlotte Free": [{ threshold: null, pct: 30 }]
 *     },
 *     telegram: {
 *       "main": [{ threshold: null, pct: 25 }]
 *     }
 *   }
 *
 * Legacy creators (pre-0043) had a flat `{ platform: tiers[] }` shape.
 * Migration 0043 wraps the legacy arrays under page_name "main", so
 * downstream code can rely on the nested shape from that point on.
 *
 * The legacy alias `CommissionTiersLegacy` is preserved for
 * backward-compat reading during the 3b/3c transition window.
 */
export type CommissionTiersByPage = Partial<
  Record<TalentPlatform, Record<string, CommissionTier[]>>
>;
export type CommissionTiers = CommissionTiersByPage;

/** Deprecated: pre-0043 flat shape. Read-only fallback during the
 *  Sweep 3 transition. */
export type CommissionTiersLegacy = Partial<
  Record<TalentPlatform, CommissionTier[]>
>;

/**
 * R5 Sweep 3a: one row in the creator_agreements table — supports
 * multiple agreements (amendments) per (creator, platform, page).
 */
export interface CreatorAgreement {
  id: string;
  creator_id: string;
  platform: TalentPlatform;
  page_name: string;
  label: string;
  url: string;
  signed_at: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Compute Recast's commission for a given platform + gross revenue using
 * the talent's tier table. Progressive: each tier applies only to the slice
 * of revenue inside its threshold.
 *
 *   commissionForTiers([{threshold:100000, pct:25}, {threshold:null, pct:20}], 150000)
 *     → 100000 * 0.25 + 50000 * 0.20 = 25000 + 10000 = 35000
 *
 *   commissionForTiers([{threshold:null, pct:25}], 50000)
 *     → 50000 * 0.25 = 12500
 *
 * If tiers is undefined/empty, returns 0 (caller should fall back to the
 * legacy commission_pct_by_platform flat shape).
 */
export function commissionForTiers(tiers: CommissionTier[] | undefined, gross: number): number {
  if (!tiers || tiers.length === 0 || gross <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => {
    if (a.threshold === null) return 1;
    if (b.threshold === null) return -1;
    return a.threshold - b.threshold;
  });
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
  return total;
}

// ─────────────────────────────────────────────────────────────────────
// Vendors / Talents / Banking
// ─────────────────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  kind: VendorKind;
  division: Division | null;
  payment_method: PaymentMethod | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  account_profile: string | null;
  notes: string | null;
  active: boolean;
  /** Phase M-1: Discord / Telegram / generic IM handle. Separate from email/phone. */
  username_handle: string | null;
  /** Phase M-1: NDA signed status. Required signal for compliance — Gustavo asks
   *  for this on every vendor; the URL is optional supporting evidence. */
  nda_signed: boolean;
  nda_url: string | null;
  // R5 Sweep 1 (Gustavo, T2 reversal): service_provided dropped via
  // migration 0041. Originally added in 0034 (R3B); removed because
  // "it's going to be listed on the invoice".
  /** Round 4 (0037): when TRUE the vendor grid renders an "Expected $X"
   *  placeholder for each unbilled month using recurring_amount. */
  recurring_monthly: boolean;
  /** Round 4 (0037): default monthly payment amount; populates the
   *  placeholder cell + pre-fills the payment dialog on click. */
  recurring_amount: number | null;
  /** R5 Sweep 2 (0042): multi-platform handles. Shape:
   *  { platform_slug: handle }. Mirrors creators.socials. The legacy
   *  username_handle column is preserved as a backward-compat shim. */
  socials: Record<string, string>;
  /** Round 4 B (0039): tag this vendor for 1099 tracking. When TRUE
   *  it surfaces on /tax. */
  requires_tax_info: boolean;
  /** Round 4 B (0039): one W9 per vendor, valid forever (replace
   *  the URL to update). */
  w9_url: string | null;
  /** Round 4 B (0039): timestamp the W9 was received. Independent
   *  of w9_url so the "received" signal can be set without the
   *  link being on file yet. */
  w9_received_at: string | null;
  /** R5 Sweep 4 (0045): vendor profile parity with creators —
   *  separate legal vs. business name, mailing address. (nda_url
   *  already lived on the type from Phase M-1; the column is also
   *  added in 0045 in case it was missing.) All nullable; the dialog
   *  gates the editor UI to kind='vendor'. */
  legal_name: string | null;
  business_name: string | null;
  address: string | null;
  /** Migration 0050: when kind='talent_we_pay' the row is a shim for
   *  a Talent Ledger creator. This FK points at the underlying
   *  creators row; one talent_we_pay row per creator. NULL for
   *  vendor-side rows. */
  creator_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * R5 Sweep 4: one row in the vendor_agreements table. Mirrors
 * CreatorAgreement but with `category` instead of `page_name` since
 * vendors don't have OF-style multi-page setups. Multiple rows per
 * (vendor, category) supported — amendments stack alongside originals.
 */
export type VendorAgreementCategory =
  | "msa"
  | "sow"
  | "nda"
  | "dpa"
  | "other";

export interface VendorAgreement {
  id: string;
  vendor_id: string;
  category: VendorAgreementCategory;
  label: string;
  url: string;
  signed_at: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Tax records (Round 4 B) — one row per tracked subject per year
// ─────────────────────────────────────────────────────────────────────

export type TaxSubjectKind = "creator" | "vendor";

export interface TaxRecord {
  id: string;
  subject_kind: TaxSubjectKind;
  subject_id: string;
  year: number;
  /** Manually entered at year end; system doesn't auto-calculate. */
  amount_reported: number | null;
  /** Drive/Dropbox link to the issued 1099 for this year. */
  ten99_url: string | null;
  ten99_sent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankingDetails {
  id: string;
  vendor_id: string | null;
  creator_id: string | null;
  bank_name: string | null;
  account_holder: string | null;
  swift_sort: string | null;
  aba_iban_bsb_ifsc: string | null;
  account_number: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_holder: string | null;
  card_expiry: string | null;
  account_profile: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultAccessLogEntry {
  id: number;
  banking_id: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: "admin" | "partner" | "accounting" | null;
  action: "view" | "create" | "update" | "delete";
  ip_address: string | null;
  user_agent: string | null;
  fields: string[] | null;
  accessed_at: string;
}

export interface VendorPayment {
  id: string;
  vendor_id: string;
  period_year: number;
  period_month: number; // 1-12
  status: PaymentStatusV2;
  amount: number | null;
  paid_at: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Frazier's House
// ─────────────────────────────────────────────────────────────────────

export interface HouseResident {
  id: string;
  name: string;
  bedroom: string;
  /** Legacy per-resident rent. Kept for the resident card's edit dialog +
   *  display, but rent_group.monthly_rent is the authoritative source for
   *  the rent grid (Phase M-2). */
  monthly_rent: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  /** Phase M-2: the rent unit this resident pays rent through. Most
   *  residents have a 1:1 group; H&K share one. Nullable only because
   *  newly inserted rows might briefly lack one before backfill. */
  rent_group_id: string | null;
}

/** Phase M-2: a rent unit. One row in the rent grid per group. */
export interface RentGroup {
  id: string;
  label: string;
  monthly_rent: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseUtility {
  id: string;
  utility_name: string;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface HouseUtilityPayment {
  id: string;
  utility_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  /** Phase K-3a (migration 0027): amount paid against this row, kept
   *  in sync by the reconcile_period_status trigger. Type was missing
   *  this field — added in R5 follow-up after the combined house
   *  payment hook started reading it. */
  amount_paid: number;
  status: PaymentStatusV2;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseRentPayment {
  id: string;
  /** Phase M-2: now nullable / legacy. rent_group_id is the authoritative key. */
  resident_id: string | null;
  /** Phase M-2: every rent payment row belongs to exactly one rent_group. */
  rent_group_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  /** Phase K-3a: amount paid against this row, kept in sync by the
   *  reconcile_period_status trigger. */
  amount_paid: number;
  status: PaymentStatusV2;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────────────────────────────

export interface TeleDeal {
  id: string;
  creator_id: string;
  recast_commission_pct: number;
  commission_basis: CommissionBasis;
  min_guarantee: number | null;
  contract_start: string;
  contract_end: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelePeriodPerformance {
  id: string;
  creator_id: string;
  period_year: number;
  period_month: number;
  gross_revenue: number;
  net_revenue: number;
  mg_top_up: number;
  recast_commission: number;
  qualified_for_mg: boolean;
  status: PaymentStatusV2;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// OnlyFans
// ─────────────────────────────────────────────────────────────────────

export interface OFDeal {
  id: string;
  creator_id: string;
  page_name: string;
  recast_pct: number;
  basis: CommissionBasis;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OFPeriodPerformance {
  id: string;
  of_deal_id: string;
  period_year: number;
  period_month: number;
  gross_revenue: number;
  net_revenue: number;
  recast_commission: number;
  girls_share: number;
  status: PaymentStatusV2;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// eFuse Campaigns (rebuilt)
// ─────────────────────────────────────────────────────────────────────

export interface CampaignV2 {
  id: string;
  name: string;
  brand: string;
  campaign_type: string | null;
  status: CampaignStatusV2;
  default_commission_pct: number;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  /** R5 Sweep 1 (Gustavo, T2): number of posts/deliverables agreed for
   *  the campaign. Replaces fixed end-date as the "how much work"
   *  signal — campaigns are deliverables-based, not date-bounded. */
  deliverables_count: number | null;
  /** Ad Overlay deals: $ per 1,000 viewers per ad airing. Null for
   *  non-Ad-Overlay campaigns. Lives on the campaign because every
   *  attached creator inherits one rate card. */
  cpm_rate: number | null;
  /** Ad Overlay deals: ads played per streaming hour. Null for non-
   *  Ad-Overlay campaigns. */
  ad_frequency_per_hr: number | null;
  brief_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CampaignCreatorV2 {
  id: string;
  campaign_id: string;
  creator_id: string;
  commission_pct: number | null; // null = inherit campaign default
  start_date: string | null;
  end_date: string | null;
  deal_type: "cpm" | "flat_fee" | "per_stream" | "hybrid";
  cpm_rate: number | null;
  views: number | null;
  displays: number | null;
  clicks: number | null;
  ctr_pct: number | null;
  flat_amount: number | null;
  per_stream_rate: number | null;
  stream_count: number | null;
  cached_earnings: number;
  cached_commission: number;
  manual_inputs: Record<string, unknown>;
  notes: string | null;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPayment {
  id: string;
  campaign_creator_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  /** Sum of receipts allocated to this row via the Payments engine.
   *  Drives the effective status (paid / partial / unpaid / overdue). */
  amount_paid: number;
  /** Legacy stored hint — kept in DB for the activity log but no
   *  longer authoritative. UI derives status from amount_paid +
   *  period EOM via effectiveInvoiceStatus. */
  status: PaymentStatusV2;
  paid_at: string | null;
  invoice_url: string | null;
  notes: string | null;
  /** Ad Overlay deals: average concurrent viewer count during this
   *  month's airtime. Null for other deal types. */
  ccv: number | null;
  /** Ad Overlay deals: total streamed minutes in this month. Null
   *  for other deal types. */
  airtime_minutes: number | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Phase K-4: Ad-hoc vendor invoices
// ─────────────────────────────────────────────────────────────────────

/** A one-off bill outside the recurring monthly grid. Has its own
 *  due date and amount; status flips paid/overdue independently. */
export interface VendorInvoice {
  id: string;
  vendor_id: string;
  description: string;
  issued_at: string; // ISO date
  due_date: string; // ISO date
  amount: number;
  status: PaymentStatusV2;
  paid_at: string | null;
  invoice_url: string | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Phase M-6: Talent Paying Us invoices
// ─────────────────────────────────────────────────────────────────────

/** A monthly invoice from Recast to a creator. One row per
 *  (creator, year, month) — covers all platforms that creator earns on
 *  that month. The Calculator (M-5) computes the amount; this row
 *  tracks how the invoice is paid. */
export interface TalentInvoice {
  id: string;
  creator_id: string;
  period_year: number;
  period_month: number; // 1-12
  invoice_number: string | null;
  amount: number;
  due_date: string; // ISO date
  invoice_url: string | null;
  notes: string | null;
  status: PaymentStatusV2;
  amount_paid: number;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Phase K-3: Payment allocation engine
// ─────────────────────────────────────────────────────────────────────

export type PaymentSource =
  | "vendor"
  | "campaign"
  | "telegram"
  | "onlyfans"
  | "house_rent"
  | "house_utility";

/** A single chunk of money received/paid. Polymorphic obligor — exactly one
 *  of vendor_id/campaign_creator_id/creator_id/of_deal_id/resident_id/utility_id
 *  is non-null, matching `source`. */
export interface PaymentReceipt {
  id: string;
  source: PaymentSource;
  vendor_id: string | null;
  campaign_creator_id: string | null;
  creator_id: string | null;
  of_deal_id: string | null;
  resident_id: string | null;
  utility_id: string | null;
  received_at: string; // ISO date
  amount: number;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Links a receipt to one (year, month) bucket on the obligor's monthly grid.
 *  One receipt can have multiple allocations (e.g. paid 2 months at once). */
export interface PaymentAllocation {
  id: string;
  receipt_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  notes: string | null;
  created_at: string;
}
