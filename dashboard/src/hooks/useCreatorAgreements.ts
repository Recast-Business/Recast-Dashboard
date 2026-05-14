import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { CreatorAgreement } from "@/types/finance";

/**
 * R5 Sweep 3b — CRUD hooks for the creator_agreements table.
 *
 * The agreements table replaces the flat creators.agreement_links JSON
 * map, adding support for multiple agreements (amendments) per
 * (creator, platform, page). One row per agreement; the profile
 * dialog batches up edits and submits via `useReplaceCreatorAgreements`
 * (delete-all-and-bulk-insert flow keeps the diff logic simple).
 *
 * RLS (from migration 0043):
 *   • Read: any authenticated user
 *   • Write: admin + finance only
 */

export function useCreatorAgreements(creatorId: string | null | undefined) {
  return useQuery({
    enabled: !!creatorId,
    queryKey: ["creator-agreements", creatorId],
    queryFn: async (): Promise<CreatorAgreement[]> => {
      const { data, error } = await supabase
        .from("creator_agreements")
        .select("*")
        .eq("creator_id", creatorId!)
        .order("platform", { ascending: true })
        .order("page_name", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CreatorAgreement[];
    },
  });
}

/**
 * R5 Sweep 3d — list-page variant. Fetches every creator_agreements
 * row in one query, lets the consumer group them client-side. Used by
 * TalentLedger's per-row agreement pill + completeness audit.
 *
 * One round-trip beats per-row queries (would be N+1 across the
 * signed roster). The result is small (5 platforms × handful of
 * creators × few amendments) so paging isn't worth the complexity.
 */
export function useAllCreatorAgreements() {
  return useQuery({
    queryKey: ["creator-agreements", "all"],
    queryFn: async (): Promise<CreatorAgreement[]> => {
      const { data, error } = await supabase
        .from("creator_agreements")
        .select("*")
        .order("creator_id", { ascending: true })
        .order("platform", { ascending: true })
        .order("page_name", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CreatorAgreement[];
    },
  });
}

export interface CreatorAgreementDraft {
  // Existing rows carry an id (kept on the client so we don't churn it);
  // new rows the user just added are id-less. The replace mutation
  // ignores incoming ids — we delete everything for the creator and
  // bulk-insert from scratch. The id is kept here purely so React
  // can use it as a list key during editing.
  id?: string;
  platform: CreatorAgreement["platform"];
  page_name: string;
  label: string;
  url: string;
  signed_at?: string | null;
  notes?: string | null;
  sort_order?: number;
}

/**
 * Replace the entire agreement set for one creator.
 *
 * Flow:
 *   1. Delete all existing creator_agreements rows for this creator.
 *   2. Bulk-insert the new set.
 *
 * Trade-offs:
 *   • Simple — no diff logic, no per-row mutations.
 *   • Generates new row IDs each save (existing IDs are dropped).
 *     OK because we don't have anything else referencing these rows.
 *   • Brief atomicity gap between delete + insert; if the insert
 *     fails, the row stays empty. The dialog Save handler should
 *     surface the failure clearly so the user knows to retry.
 *
 * Drafts with empty `url` after trim are skipped silently — lets the
 * dialog keep blank placeholder rows around during editing without
 * polluting the DB.
 */
export function useReplaceCreatorAgreements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      creator_id: string;
      drafts: CreatorAgreementDraft[];
    }) => {
      const { creator_id, drafts } = args;

      // Clean: drop rows with empty URLs (placeholders).
      const inserts = drafts
        .map((d) => ({
          creator_id,
          platform: d.platform,
          page_name: (d.page_name ?? "main").trim() || "main",
          label: (d.label ?? "").trim() || "Agreement",
          url: (d.url ?? "").trim(),
          signed_at: d.signed_at ?? null,
          notes: (d.notes ?? "")?.trim() || null,
          sort_order: d.sort_order ?? 0,
        }))
        .filter((d) => d.url !== "");

      // Wipe existing rows for this creator.
      const { error: delErr } = await supabase
        .from("creator_agreements")
        .delete()
        .eq("creator_id", creator_id);
      if (delErr) throw delErr;

      // Insert the new set (if any).
      if (inserts.length > 0) {
        const { error: insErr } = await supabase
          .from("creator_agreements")
          .insert(inserts);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["creator-agreements", args.creator_id] });
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Agreement save failed: ${(e as Error).message}`),
  });
}
