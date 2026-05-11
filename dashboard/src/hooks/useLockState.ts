import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { isMonthOpen, isMonthRecent } from "@/lib/utils";

/**
 * Round 4 A.2 — financial period locking.
 *
 * Two layered rules + an admin override:
 *
 *   Base rules (lib/utils):
 *     • isMonthOpen(year, month)   — can NEW entries be created?
 *         True for current/future months. (R3D.2)
 *     • isMonthRecent(year, month) — can EXISTING rows be edited?
 *         True for the trailing 6 months. (R4 Gustavo)
 *
 *   Override (this hook + unlocked_periods table):
 *     • An admin/finance row in unlocked_periods unlocks a specific
 *       (year, month) for everyone — opens it for new entries AND
 *       edits regardless of the base rules.
 *
 * Usage:
 *   const lock = useLockState();
 *   if (lock.canCreate(year, month)) { ... }
 *   if (lock.canEdit(year, month))   { ... }
 *   lock.unlock(year, month, "Adjusting Frazier's Mar invoice");
 *   lock.relock(year, month);
 *
 * The hook prefetches all unlocked periods on first use; updates are
 * realtime-invalidated via React Query so unlock/relock by one user
 * propagates to everyone's grids on the next refetch.
 */

interface UnlockedPeriod {
  id: string;
  year: number;
  month: number;
  unlocked_by: string | null;
  unlocked_at: string;
  note: string | null;
}

export function useLockState() {
  const qc = useQueryClient();

  const { data: unlocked } = useQuery({
    queryKey: ["unlocked-periods"],
    queryFn: async (): Promise<UnlockedPeriod[]> => {
      const { data, error } = await supabase
        .from("unlocked_periods")
        .select("*");
      if (error) throw error;
      return (data ?? []) as UnlockedPeriod[];
    },
  });

  // Membership lookup: key = `${year}-${month}` for O(1) checks.
  const unlockedSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const u of unlocked ?? []) set.add(`${u.year}-${u.month}`);
    return set;
  }, [unlocked]);

  const isUnlocked = React.useCallback(
    (year: number, month: number) => unlockedSet.has(`${year}-${month}`),
    [unlockedSet],
  );

  const canCreate = React.useCallback(
    (year: number, month: number) =>
      isMonthOpen(year, month) || isUnlocked(year, month),
    [isUnlocked],
  );

  const canEdit = React.useCallback(
    (year: number, month: number) =>
      isMonthRecent(year, month) || isUnlocked(year, month),
    [isUnlocked],
  );

  const unlockMutation = useMutation({
    mutationFn: async (args: { year: number; month: number; note?: string }) => {
      const { error } = await supabase
        .from("unlocked_periods")
        .insert({ year: args.year, month: args.month, note: args.note ?? null });
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      toast.success(
        `${monthName(args.month)} ${args.year} unlocked for editing.`,
      );
      qc.invalidateQueries({ queryKey: ["unlocked-periods"] });
      qc.invalidateQueries({ queryKey: ["activity-feed"] });
    },
    onError: (e) => toast.error(`Unlock failed: ${(e as Error).message}`),
  });

  const relockMutation = useMutation({
    mutationFn: async (args: { year: number; month: number }) => {
      const { error } = await supabase
        .from("unlocked_periods")
        .delete()
        .eq("year", args.year)
        .eq("month", args.month);
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      toast.success(`${monthName(args.month)} ${args.year} re-locked.`);
      qc.invalidateQueries({ queryKey: ["unlocked-periods"] });
      qc.invalidateQueries({ queryKey: ["activity-feed"] });
    },
    onError: (e) => toast.error(`Re-lock failed: ${(e as Error).message}`),
  });

  return {
    unlockedPeriods: unlocked ?? [],
    isUnlocked,
    canCreate,
    canEdit,
    unlock: (year: number, month: number, note?: string) =>
      unlockMutation.mutate({ year, month, note }),
    relock: (year: number, month: number) =>
      relockMutation.mutate({ year, month }),
    isUnlocking: unlockMutation.isPending,
    isRelocking: relockMutation.isPending,
  };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthName(m: number): string {
  return MONTH_NAMES[m - 1] ?? `M${m}`;
}
