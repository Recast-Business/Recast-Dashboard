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
  created_at: string;
  updated_at: string;
  created_by: string | null;
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
  user_role: "admin" | "partner" | "finance" | null;
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
  monthly_rent: number;
  active: boolean;
  notes: string | null;
  created_at: string;
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
  status: PaymentStatusV2;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseRentPayment {
  id: string;
  resident_id: string;
  period_year: number;
  period_month: number;
  amount: number;
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
  is_ad_overlay: boolean;
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
  status: PaymentStatusV2;
  paid_at: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
