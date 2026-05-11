// Placeholder until `supabase gen types typescript --project-id <id>` is run
// against the real project. Shape below matches migrations 0001–0007.

export type UserRole = "admin" | "partner" | "finance" | "operator";
export type CampaignStatus =
  | "active"
  | "pending"
  | "awaiting_payment"
  | "overdue"
  | "completed";
export type PaymentStatus = "unpaid" | "awaiting" | "paid" | "overdue";
export type BriefStage =
  | "idea"
  | "outreach"
  | "negotiating"
  | "exclusive"
  | "lost";
export type ActivityKind =
  | "campaign_created"
  | "creator_added"
  | "earnings_updated"
  | "payment_status_changed"
  | "overdue_flagged"
  | "brief_promoted"
  | "payment_logged"
  | "commission_mode_changed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: UserRole;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at"> & {
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      brands: {
        Row: {
          id: string;
          name: string;
          contact_name: string | null;
          contact_email: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["brands"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["brands"]["Row"]>;
      };
      campaigns: {
        Row: {
          id: string;
          brand_id: string;
          name: string;
          status: CampaignStatus;
          start_date: string | null;
          end_date: string | null;
          payment_due_date: string | null;
          commission_rate: number;
          is_ad_overlay: boolean;
          brief_id: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["campaigns"]["Row"]> & {
          brand_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Row"]>;
      };
      creators: {
        Row: {
          id: string;
          name: string;
          twitch_handle: string | null;
          kick_handle: string | null;
          twitter: string | null;
          instagram: string | null;
          country: string | null;
          tier: string | null;
          status: string;
          notes: string | null;
          imported_from_excel: boolean;
          signed: boolean;
          signed_at: string | null;
          contract_terms: string | null;
          category: string | null;
          socials: Record<string, string>;
          twitch_30d_ccv: number | null;
          kick_30d_ccv: number | null;
          ccv_fetched_at: string | null;
          starred: boolean;
          outreach_status: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["creators"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["creators"]["Row"]>;
      };
      campaign_creators: {
        Row: {
          id: string;
          campaign_id: string;
          creator_id: string;
          deal_structure: unknown;
          manual_inputs: unknown;
          cached_earnings: number;
          cached_commission: number;
          payment_status: PaymentStatus;
          payment_due_date: string | null;
          last_calculated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["campaign_creators"]["Row"]> & {
          campaign_id: string;
          creator_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_creators"]["Row"]>;
      };
      payments: {
        Row: {
          id: string;
          campaign_creator_id: string;
          amount: number;
          paid_at: string | null;
          period_start: string | null;
          period_end: string | null;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          campaign_creator_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
      };
      activity_log: {
        Row: {
          id: number;
          kind: ActivityKind;
          actor_id: string | null;
          campaign_id: string | null;
          creator_id: string | null;
          payload: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["activity_log"]["Row"]> & {
          kind: ActivityKind;
        };
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Row"]>;
      };
      briefs: {
        Row: {
          id: string;
          title: string;
          brand: string | null;
          stage: BriefStage;
          budget: number | null;
          geo: string[] | null;
          platforms: string[] | null;
          content_type: string | null;
          notes: string | null;
          linked_campaign_id: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["briefs"]["Row"]> & { title: string };
        Update: Partial<Database["public"]["Tables"]["briefs"]["Row"]>;
      };
    };
    Views: {
      campaign_creators_public: {
        Row: Omit<
          Database["public"]["Tables"]["campaign_creators"]["Row"],
          "cached_earnings" | "cached_commission" | "payment_status"
        >;
      };
    };
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      campaign_status: CampaignStatus;
      payment_status: PaymentStatus;
      brief_stage: BriefStage;
      activity_kind: ActivityKind;
    };
  };
}
