import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Phase L (C1.1): nav-badge counts for the sidebar.
 *
 * Creator counts (Roster/Leads/Potential) come from one cheap
 * two-boolean-column query. Round 3 adds `tasks` — the CURRENT
 * USER's open task count. Round 4: tasks can have multiple
 * assignees or be team-wide, so this now calls the
 * my_open_task_count() RPC (0056) instead of a direct
 * .eq("assignee_id", ...) count. Cache lives 60s so the sidebar
 * stays responsive across route changes without re-fetching; task
 * mutations invalidate ["nav-counts"] directly so the badge updates
 * immediately on complete/create/reassign.
 */

export interface NavCounts {
  roster: number;
  tasks: number;
}

export function useNavCounts() {
  const { user } = useAuth();
  return useQuery<NavCounts>({
    queryKey: ["nav-counts", user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const [creatorsRes, tasksRes] = await Promise.all([
        supabase.from("creators").select("signed"),
        user ? supabase.rpc("my_open_task_count") : Promise.resolve({ data: 0, error: null }),
      ]);
      if (creatorsRes.error) throw creatorsRes.error;
      // Tasks table/RPC may predate migration 0054/0056 on an
      // environment — a missing-relation/function error shouldn't
      // nuke the other badges.
      const tasks = tasksRes.error ? 0 : (tasksRes.data as number) ?? 0;

      const rows = (creatorsRes.data ?? []) as { signed: boolean | null }[];
      let roster = 0;
      for (const r of rows) {
        if (r.signed) roster++;
      }
      return { roster, tasks };
    },
  });
}
