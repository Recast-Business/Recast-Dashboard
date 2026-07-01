import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types/database";

/**
 * Admin user management — thin wrappers over the admin_* Postgres RPCs
 * (migration 0051). Every RPC is SECURITY DEFINER with an in-body
 * admin-role check, so these calls are safe to expose to any signed-in
 * session: a non-admin gets a 'forbidden' error from the DB, not data.
 * All mutations audit-log server-side (activity_log).
 */

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  view_campaign_financials: boolean;
  requires_tax_info: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  /** null = active. 'infinity' (or a future timestamp) = disabled. */
  banned_until: string | null;
}

/** True when the account is currently blocked from signing in. */
export function isDisabled(u: AdminUser): boolean {
  if (!u.banned_until) return false;
  if (u.banned_until === "infinity") return true;
  const t = new Date(u.banned_until);
  return Number.isFinite(t.getTime()) && t > new Date();
}

const KEY = ["admin", "users"] as const;

export function useAdminUsers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });
}

function useAdminMutation<TVars>(fn: (vars: TVars) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetUserRole() {
  return useAdminMutation(async (v: { userId: string; role: UserRole }) => {
    const { error } = await supabase.rpc("admin_set_user_role", {
      p_user_id: v.userId,
      p_role: v.role,
    });
    if (error) throw error;
  });
}

export function useSetUserFlag() {
  return useAdminMutation(
    async (v: {
      userId: string;
      flag: "view_campaign_financials" | "requires_tax_info";
      value: boolean;
    }) => {
      const { error } = await supabase.rpc("admin_set_user_flag", {
        p_user_id: v.userId,
        p_flag: v.flag,
        p_value: v.value,
      });
      if (error) throw error;
    },
  );
}

export function useSetUserEmail() {
  return useAdminMutation(async (v: { userId: string; email: string }) => {
    const { error } = await supabase.rpc("admin_set_user_email", {
      p_user_id: v.userId,
      p_email: v.email,
    });
    if (error) throw error;
  });
}

export function useSetUserPassword() {
  return useAdminMutation(async (v: { userId: string; password: string }) => {
    const { error } = await supabase.rpc("admin_set_user_password", {
      p_user_id: v.userId,
      p_password: v.password,
    });
    if (error) throw error;
  });
}

export function useSetUserActive() {
  return useAdminMutation(async (v: { userId: string; active: boolean }) => {
    const { error } = await supabase.rpc("admin_set_user_active", {
      p_user_id: v.userId,
      p_active: v.active,
    });
    if (error) throw error;
  });
}

export function useDeleteUser() {
  return useAdminMutation(async (v: { userId: string }) => {
    const { error } = await supabase.rpc("admin_delete_user", {
      p_user_id: v.userId,
    });
    if (error) throw error;
  });
}

export function useCreateUser() {
  return useAdminMutation(
    async (v: {
      email: string;
      password: string;
      role: UserRole;
      viewCampaignFinancials: boolean;
      fullName: string | null;
    }) => {
      const { error } = await supabase.rpc("admin_create_user", {
        p_email: v.email,
        p_password: v.password,
        p_role: v.role,
        p_view_campaign_financials: v.viewCampaignFinancials,
        p_full_name: v.fullName,
      });
      if (error) throw error;
    },
  );
}

/** Random 12-char temp password: unambiguous letters + digits. */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
