// Type aliases for the columns/enums consumed across the dashboard
// surface. Was originally a hand-rolled `Database` interface placeholder
// before `supabase gen types typescript` ran — but that wider shape
// went stale across the 0020 finance overhaul and 0043 per-page work
// while nothing imported it (everything reads inline types or imports
// from `@/types/finance`).
//
// R5 follow-up: trimmed to the three enum-like aliases that are
// actually used. Re-introduce a full `Database` type via the Supabase
// codegen when we want strict end-to-end typing.

export type UserRole = "admin" | "partner" | "finance" | "operator";

/** briefs.stage enum (migration 0005). */
export type BriefStage =
  | "idea"
  | "outreach"
  | "negotiating"
  | "exclusive"
  | "lost";

/**
 * activity_log.kind enum (migration 0004 + later additions).
 *
 * Additions tracked here for the client-side narrow:
 *   • brief_promoted          (0004)
 *   • payment_logged          (0009)
 *   • commission_mode_changed (0036)
 *   • period_unlocked         (0038)
 *   • period_relocked         (0038)
 */
export type ActivityKind =
  | "campaign_created"
  | "creator_added"
  | "earnings_updated"
  | "payment_status_changed"
  | "overdue_flagged"
  | "brief_promoted"
  | "payment_logged"
  | "commission_mode_changed"
  | "period_unlocked"
  | "period_relocked";
