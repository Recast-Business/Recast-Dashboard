import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

/**
 * R5 follow-up — client hooks for talent_grid_tracking (migration 0046).
 *
 * The Invoice page grids ("Talent Paying Us" + "Talent We Pay") now
 * pull their visible rows from this table. "+ Add Talent" inserts a
 * tracking row; the grid renders all tracked rows even when no
 * invoice/payment exists yet for that talent/year.
 *
 * Grid composition (client-side):
 *
 *   visibleRows = union(
 *     tracked_targets(side, year),
 *     targets_with_data_in_year(side, year),
 *   )
 *
 * The "with data" set covers historical rows where Gus didn't go
 * through "+ Add Talent" — anyone with an actual invoice/payment
 * still shows up automatically.
 */

export type TalentGridSide = "paying_us" | "we_pay";

export interface TalentGridTrackingRow {
  id: string;
  side: TalentGridSide;
  creator_id: string | null;
  vendor_id: string | null;
  year: number;
  added_by: string | null;
  added_at: string;
}

export function useTalentGridTracking(side: TalentGridSide, year: number) {
  return useQuery({
    queryKey: ["talent-grid-tracking", side, year],
    queryFn: async (): Promise<TalentGridTrackingRow[]> => {
      const { data, error } = await supabase
        .from("talent_grid_tracking")
        .select("*")
        .eq("side", side)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as TalentGridTrackingRow[];
    },
  });
}

export function useAddTalentToGrid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      side: TalentGridSide;
      year: number;
      // Exactly one is set, matching args.side.
      creator_id?: string;
      vendor_id?: string;
    }) => {
      const insert: Record<string, unknown> = {
        side: args.side,
        year: args.year,
        creator_id: args.creator_id ?? null,
        vendor_id: args.vendor_id ?? null,
      };
      // Idempotent: if the row already exists (unique constraint
      // catches it), swallow the duplicate so re-clicking "+ Add"
      // doesn't toast an error.
      const { error } = await supabase
        .from("talent_grid_tracking")
        .insert(insert);
      if (error && !/duplicate key/i.test(error.message)) throw error;
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({
        queryKey: ["talent-grid-tracking", args.side, args.year],
      });
    },
    onError: (e) => toast.error(`Add to grid failed: ${(e as Error).message}`),
  });
}

export function useRemoveTalentFromGrid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; side: TalentGridSide; year: number }) => {
      const { error } = await supabase
        .from("talent_grid_tracking")
        .delete()
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({
        queryKey: ["talent-grid-tracking", args.side, args.year],
      });
    },
    onError: (e) => toast.error(`Remove from grid failed: ${(e as Error).message}`),
  });
}
