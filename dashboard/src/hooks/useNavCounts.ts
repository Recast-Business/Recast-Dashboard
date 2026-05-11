import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Phase L (C1.1): nav-badge counts for the sidebar.
 *
 * One Supabase query → derived counts for Roster (signed), Leads
 * (unsigned), and Potential (starred). Cheap because we only select
 * two boolean columns; cache lives 60s so the sidebar stays responsive
 * across route changes without re-fetching.
 */

export interface NavCounts {
  roster: number;
  leads: number;
  potential: number;
}

export function useNavCounts() {
  return useQuery<NavCounts>({
    queryKey: ["nav-counts"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("signed, starred");
      if (error) throw error;
      const rows = (data ?? []) as { signed: boolean | null; starred: boolean | null }[];
      let roster = 0;
      let leads = 0;
      let potential = 0;
      for (const r of rows) {
        if (r.signed) roster++;
        else leads++;
        if (r.starred) potential++;
      }
      return { roster, leads, potential };
    },
  });
}
