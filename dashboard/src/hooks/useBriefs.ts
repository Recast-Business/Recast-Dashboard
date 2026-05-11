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
    onSuccess: (data) => {
      toast.success(
        data?.linked_campaign_id
          ? "Brief moved — campaign auto-created"
          : "Brief moved",
      );
      qc.invalidateQueries({ queryKey: ["briefs", "list"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(`Move failed: ${(e as Error).message}`),
  });
}
