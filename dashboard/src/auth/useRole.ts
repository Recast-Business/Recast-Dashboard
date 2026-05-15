import { useAuth } from "./AuthProvider";
import type { UserRole } from "@/types/database";

export function useRole(): UserRole | null {
  return useAuth().role;
}

export function canAccess(role: UserRole | null, allowed: UserRole[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}

/**
 * Returns whether the current user should see $ + % figures on campaign views.
 * Always true for admin / finance / partner. For operators, gated by the
 * `view_campaign_financials` flag on their profile (Bruno=true, Harry=false).
 */
export function useViewCampaignFinancials(): boolean {
  return useAuth().viewCampaignFinancials;
}

export const NAV_ACCESS: Record<string, UserRole[]> = {
  campaigns: ["admin", "partner", "accounting", "operator"],
  finance: ["admin", "accounting"],                       // operator excluded
  roster: ["admin", "partner", "accounting", "operator"],
  leads: ["admin", "partner", "operator"],
  scout: ["admin", "partner", "operator"],
  potential: ["admin", "partner", "operator"],
  briefs: ["admin", "partner", "operator"],
  activity: ["admin", "accounting"],                      // operator excluded
};
