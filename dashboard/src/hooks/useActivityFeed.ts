import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ActivityKind } from "@/types/database";

export interface ActivityItem {
  id: number;
  kind: ActivityKind;
  created_at: string;
  campaign_id: string | null;
  creator_id: string | null;
  payload: Record<string, unknown> | null;
}

interface Options {
  limit?: number;
  campaignId?: string | null;
}

export function useActivityFeed(opts: Options | number = {}) {
  const { limit = 50, campaignId = null } =
    typeof opts === "number" ? { limit: opts, campaignId: null } : opts;
  const qc = useQueryClient();
  const queryKey = ["activity", limit, campaignId ?? "all"] as const;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ActivityItem[]> => {
      let q = supabase
        .from("activity_log")
        .select("id, kind, created_at, campaign_id, creator_id, payload")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityItem[];
    },
  });

  React.useEffect(() => {
    const channelName = campaignId
      ? `activity-feed:${campaignId}`
      : "activity-feed:all";
    const filter = campaignId ? `campaign_id=eq.${campaignId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_log",
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const row = payload.new as ActivityItem;
          if (campaignId && row.campaign_id !== campaignId) return;
          qc.setQueryData<ActivityItem[]>([...queryKey], (prev) => {
            const next = [row, ...(prev ?? [])];
            return next.slice(0, limit);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, limit, campaignId, queryKey]);

  return query;
}
