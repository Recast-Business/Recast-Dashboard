import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Phase L (C1.1): nav-badge counts for the sidebar.
 *
 * Creator counts (Roster/Leads/Potential) come from one cheap
 * two-boolean-column query. Round 3 adds `tasks` — the CURRENT
 * USER's open task count (head-only count query, no rows fetched).
 * Cache lives 60s so the sidebar stays responsive across route
 * changes without re-fetching; task mutations invalidate
 * ["nav-counts"] directly so the badge updates immediately on
 * complete/create.
 */

export interface NavCounts {
  roster: number;
  leads: number;
  potential: number;
  tasks: number;
}

export function useNavCounts() {
  const { user } = useAuth();
  return useQuery<NavCounts>({
    queryKey: ["nav-counts", user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const [creatorsRes, tasksRes] = await Promise.all([
        supabase.from("creators").select("signed, starred"),
        user
          ? supabase
              .from("tasks")
              .select("id", { count: "exact", head: true })
              .eq("assignee_id", user.id)
              .eq("status", "open")
          : Promise.resolve({ count: 0, error: null }),
      ]);
      if (creatorsRes.error) throw creatorsRes.error;
      // Tasks table may predate migration 0054 on an environment —
      // a missing-relation error shouldn't nuke the other badges.
      const tasks = tasksRes.error ? 0 : tasksRes.count ?? 0;

      const rows = (creatorsRes.data ?? []) as { signed: boolean | null; starred: boolean | null }[];
      let roster = 0;
      let leads = 0;
      let potential = 0;
      for (const r of rows) {
        if (r.signed) roster++;
        else leads++;
        if (r.starred) potential++;
      }
      return { roster, leads, potential, tasks };
    },
  });
}
