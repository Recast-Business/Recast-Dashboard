import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface OverdueCounts {
  vendors: number;
  campaigns: number;
  telegram: number;
  onlyfans: number;
  house_rent: number;
  house_utility: number;
}

/**
 * Counts of overdue rows across every payment table. Used by the
 * banner at the top of /finance to surface what needs attention.
 */
function useOverdueCounts() {
  return useQuery({
    queryKey: ["overdue-counts"],
    queryFn: async (): Promise<OverdueCounts> => {
      const queries = [
        supabase.from("vendor_payments").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("campaign_payments").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("tele_period_performance").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("of_period_performance").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("house_rent_payments").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("house_utility_payments").select("id", { count: "exact", head: true }).eq("status", "overdue"),
      ];
      const [v, c, t, of_, hr, hu] = await Promise.all(queries);
      return {
        vendors: v.count ?? 0,
        campaigns: c.count ?? 0,
        telegram: t.count ?? 0,
        onlyfans: of_.count ?? 0,
        house_rent: hr.count ?? 0,
        house_utility: hu.count ?? 0,
      };
    },
    refetchInterval: 60_000, // refresh every minute so newly-flipped rows show up
  });
}

/**
 * Compact badge at the top of the finance page showing total overdue
 * payments across every section. Hidden when total is zero.
 *
 * Phase J will turn this into a clickable drawer with the full list of
 * overdue items + quick-action shortcuts. For Phase I it's just the count.
 */
export function OverdueBadge() {
  const { data } = useOverdueCounts();
  if (!data) return null;

  const total =
    data.vendors +
    data.campaigns +
    data.telegram +
    data.onlyfans +
    data.house_rent +
    data.house_utility;

  if (total === 0) return null;

  const breakdown = [
    data.vendors && `${data.vendors} vendor${data.vendors === 1 ? "" : "s"}`,
    data.campaigns && `${data.campaigns} campaign${data.campaigns === 1 ? "" : "s"}`,
    data.telegram && `${data.telegram} Tele`,
    data.onlyfans && `${data.onlyfans} OF`,
    data.house_rent && `${data.house_rent} rent`,
    data.house_utility && `${data.house_utility} utilit${data.house_utility === 1 ? "y" : "ies"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start gap-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {total} overdue payment{total === 1 ? "" : "s"} need attention
        </div>
        <div className="text-xs text-rose-800/80">{breakdown}</div>
      </div>
    </div>
  );
}
