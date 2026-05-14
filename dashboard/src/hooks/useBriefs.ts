import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { BriefStage } from "@/types/database";

export interface BriefRow {
  id: string;
  title: string;
  brand: string | null;
  stage: BriefStage;
  budget: number | null;
  geo: string[] | null;
  platforms: string[] | null;
  content_type: string | null;
  notes: string | null;
  linked_campaign_id: string | null;
  created_at: string;
}

export function useBriefs() {
  return useQuery({
    queryKey: ["briefs", "list"],
    queryFn: async (): Promise<BriefRow[]> => {
      const { data, error } = await supabase
        .from("briefs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BriefRow[];
    },
  });
}

export interface BriefInput {
  title: string;
  brand?: string | null;
  budget?: number | null;
  geo?: string[] | null;
  platforms?: string[] | null;
  content_type?: string | null;
  notes?: string | null;
}

export function useCreateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: BriefInput) => {
      const { data, error } = await supabase
        .from("briefs")
        .insert({
          title: args.title,
          brand: args.brand ?? null,
          budget: args.budget ?? null,
          geo: args.geo ?? null,
          platforms: args.platforms ?? null,
          content_type: args.content_type ?? null,
          notes: args.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      toast.success("Brief created");
      qc.invalidateQueries({ queryKey: ["briefs", "list"] });
    },
    onError: (e) => toast.error(`Brief save failed: ${(e as Error).message}`),
  });
}

export function useUpdateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: BriefInput & { id: string }) => {
      const { error } = await supabase
        .from("briefs")
        .update({
          title: args.title,
          brand: args.brand ?? null,
          budget: args.budget ?? null,
          geo: args.geo ?? null,
          platforms: args.platforms ?? null,
          content_type: args.content_type ?? null,
          notes: args.notes ?? null,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brief updated");
      qc.invalidateQueries({ queryKey: ["briefs", "list"] });
    },
    onError: (e) => toast.error(`Brief save failed: ${(e as Error).message}`),
  });
}

export function useDeleteBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("briefs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brief deleted");
      qc.invalidateQueries({ queryKey: ["briefs", "list"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
    },
    onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
  });
}

export function useMoveBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; stage: BriefStage }) => {
      const { data, error } = await supabase
        .from("briefs")
        .update({ stage: args.stage })
        .eq("id", args.id)
        .select("id, stage, linked_campaign_id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Brief moved");
      qc.invalidateQueries({ queryKey: ["briefs", "list"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(`Move failed: ${(e as Error).message}`),
  });
}

/**
 * R5 follow-up — client-side replacement for the promote_brief_to_campaign()
 * trigger that was dropped in migration 0020's finance overhaul. Inserts
 * a campaigns row populated from the brief, updates the brief's
 * linked_campaign_id, and logs a brief_promoted activity entry.
 *
 * Pre-conditions:
 *   • brief.brand must be set (campaigns.brand is NOT NULL post-0020).
 *   • brief.linked_campaign_id must be null (we don't double-promote).
 *
 * Atomicity note: this is three sequential writes, not a transaction.
 * If the brief update fails after the campaign insert, the user gets a
 * dangling campaign with no brief link — the toast surfaces the error
 * so a retry won't double-insert (the linked_campaign_id check guards
 * the next attempt). Activity log is best-effort; we ignore its error
 * so a logging hiccup doesn't block the promotion.
 */
export function usePromoteBriefToCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { brief: BriefRow }): Promise<string> => {
      const b = args.brief;
      if (b.linked_campaign_id) {
        throw new Error("Brief already linked to a campaign");
      }
      if (!b.brand || !b.brand.trim()) {
        throw new Error("Brief needs a brand before it can be promoted");
      }
      // 1. Insert the campaign row, populated from the brief.
      const { data: created, error: insErr } = await supabase
        .from("campaigns")
        .insert({
          name: b.title,
          brand: b.brand.trim(),
          status: "pending",
          brief_id: b.id,
          description: b.notes ?? null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const campaignId = (created as { id: string }).id;
      // 2. Update the brief to point at its new campaign.
      const { error: updErr } = await supabase
        .from("briefs")
        .update({ linked_campaign_id: campaignId })
        .eq("id", b.id);
      if (updErr) throw updErr;
      // 3. Activity log — best-effort, don't block the user on a
      //    logging hiccup.
      await supabase.from("activity_log").insert({
        kind: "brief_promoted",
        campaign_id: campaignId,
        payload: { brief_id: b.id, title: b.title, brand: b.brand },
      });
      return campaignId;
    },
    onSuccess: () => {
      toast.success("Brief promoted → Campaign");
      qc.invalidateQueries({ queryKey: ["briefs", "list"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(`Promote failed: ${(e as Error).message}`),
  });
}
