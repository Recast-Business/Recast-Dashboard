import { useAuth } from "./AuthProvider";
import type { UserRole } from "@/types/database";

export function useRole(): UserRole | null {
  return useAuth().role;
}

export function canAccess(role: UserRole | null, allowed: UserRole[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}

export const NAV_ACCESS: Record<string, UserRole[]> = {
  campaigns: ["admin", "partner", "finance"],
  finance: ["admin", "finance"],
  roster: ["admin", "partner"],
  scout: ["admin", "partner"],
  briefs: ["admin", "partner"],
  activity: ["admin", "finance"],
};
