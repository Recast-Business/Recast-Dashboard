import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  HouseResident,
  HouseUtility,
  HouseUtilityPayment,
  HouseRentPayment,
  PaymentStatusV2,
  RentGroup,
} from "@/types/finance";

// ─────────────────────────────────────────────────────────────────────
// Residents
// ─────────────────────────────────────────────────────────────────────

export function useHouseResidents(opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["house", "residents", !!opts.includeInactive],
    queryFn: async () => {
      let q = supabase.from("house_residents").select("*").order("created_at");
      if (!opts.includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HouseResident[];
    },
  });
}

export interface ResidentInput {
  name: string;
  bedroom: string;
  monthly_rent: number;
  active?: boolean;
  notes?: string | null;
}

export function useAddResident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ResidentInput) => {
      const { data, error } = await supabase
        .from("house_residents")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as HouseResident;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["house"] }),
  });
}

export function useUpdateResident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<ResidentInput> }) => {
      const { data, error } = await supabase
        .from("house_residents")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as HouseResident;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["house"] }),
  });
}

export function useDeleteResident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("house_residents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["house"] }),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────

export function useHouseUtilities(opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["house", "utilities", !!opts.includeInactive],
    queryFn: async () => {
      let q = supabase.from("house_utilities").select("*").order("created_at");
      if (!opts.includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HouseUtility[];
    },
  });
}

export interface UtilityInput {
  utility_name: string;
  active?: boolean;
  notes?: string | null;
}

export function useAddUtility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UtilityInput) => {
      const { data, error } = await supabase
        .from("house_utilities")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as HouseUtility;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["house"] }),
  });
}

export function useUpdateUtility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<UtilityInput> }) => {
      const { data, error } = await supabase
        .from("house_utilities")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as HouseUtility;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["house"] }),
  });
}

export function useDeleteUtility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("house_utilities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["house"] }),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Utility payments — one row per (utility, year, month)
// ─────────────────────────────────────────────────────────────────────

export function useHouseUtilityPayments(year: number) {
  return useQuery({
    queryKey: ["house", "utility-payments", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("house_utility_payments")
        .select("*")
        .eq("period_year", year);
      if (error) throw error;
      const map: Record<string, Record<number, HouseUtilityPayment>> = {};
      for (const row of (data ?? []) as HouseUtilityPayment[]) {
        map[row.utility_id] ??= {};
        map[row.utility_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export interface UtilityPaymentInput {
  utility_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  status?: PaymentStatusV2;
  paid_at?: string | null;
  notes?: string | null;
}

export function useUpsertUtilityPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UtilityPaymentInput) => {
      const { data, error } = await supabase
        .from("house_utility_payments")
        .upsert(
          {
            utility_id: input.utility_id,
            period_year: input.period_year,
            period_month: input.period_month,
            amount: input.amount,
            status: input.status ?? "unpaid",
            paid_at: input.paid_at ?? null,
            notes: input.notes ?? null,
          },
          { onConflict: "utility_id,period_year,period_month" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data as HouseUtilityPayment;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["house", "utility-payments", vars.period_year] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Rent payments — one row per (resident, year, month)
// ─────────────────────────────────────────────────────────────────────

/** Phase M-2: rent payments are now keyed by rent_group_id, not resident_id.
 *  Returns a `{ [rent_group_id]: { [month]: row } }` map so the rent grid can
 *  iterate one row per group. */
export function useHouseRentPayments(year: number) {
  return useQuery({
    queryKey: ["house", "rent-payments", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("house_rent_payments")
        .select("*")
        .eq("period_year", year);
      if (error) throw error;
      const map: Record<string, Record<number, HouseRentPayment>> = {};
      for (const row of (data ?? []) as HouseRentPayment[]) {
        map[row.rent_group_id] ??= {};
        map[row.rent_group_id][row.period_month] = row;
      }
      return map;
    },
  });
}

export interface RentPaymentInput {
  rent_group_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  status?: PaymentStatusV2;
  paid_at?: string | null;
  notes?: string | null;
}

export function useUpsertRentPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RentPaymentInput) => {
      const { data, error } = await supabase
        .from("house_rent_payments")
        .upsert(
          {
            rent_group_id: input.rent_group_id,
            period_year: input.period_year,
            period_month: input.period_month,
            amount: input.amount,
            status: input.status ?? "unpaid",
            paid_at: input.paid_at ?? null,
            notes: input.notes ?? null,
          },
          { onConflict: "rent_group_id,period_year,period_month" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data as HouseRentPayment;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["house", "rent-payments", vars.period_year] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Phase M-2: Rent groups
// ─────────────────────────────────────────────────────────────────────

/** Active rent groups, sorted alphabetically by label. The rent grid
 *  renders one row per group. */
export function useRentGroups(opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["house", "rent-groups", !!opts.includeInactive],
    queryFn: async (): Promise<RentGroup[]> => {
      let q = supabase.from("rent_groups").select("*").order("label");
      if (!opts.includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RentGroup[];
    },
  });
}

/** All residents in a given group. Used by H&K-style rent rows that
 *  need to display "Harriet, Keenan" inline below the group label. */
export function useResidentsByGroup(): Record<string, HouseResident[]> | null {
  // Helper: not a hook itself — call useHouseResidents() and group manually.
  // Kept in this file as a reminder; the actual grouping happens in the UI
  // since the residents query is already there.
  return null;
}

export interface RentGroupInput {
  label: string;
  monthly_rent: number;
  active?: boolean;
  notes?: string | null;
}

export function useUpdateRentGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<RentGroupInput> }) => {
      const { data, error } = await supabase
        .from("rent_groups")
        .update(args.patch)
        .eq("id", args.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as RentGroup;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["house"] });
    },
  });
}
