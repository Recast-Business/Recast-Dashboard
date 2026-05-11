import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiFetch";
import { syncCreatorField } from "@/lib/sheetSync";

export type CreatorFilter = "all" | "signed" | "unsigned" | "starred";

export function useCreators(filter: CreatorFilter = "all") {
  return useQuery({
    queryKey: ["creators", "list", filter],
    queryFn: async () => {
      let q = supabase
        .from("creators")
        .select(
          // Round 3 (0034): agreement_links + commission_tiers.
          // Round 3 (0035 — Q1+Q7 cliff toggle + tier migration):
          // commission_uses_cliff bool. False (default) = progressive
          // math, true = legacy cliff math for grandfathered deals.
          // The calc engine reads this per-creator and switches mode.
          "id, name, twitch_handle, kick_handle, tier, country, status, signed, contract_terms, signed_at, category, socials, twitch_30d_ccv, kick_30d_ccv, ccv_fetched_at, starred, outreach_status, legal_name, business_name, email, phone, address, payment_method_pref, tax_id, commission_pct_by_platform, agreement_links, commission_tiers, commission_uses_cliff",
        )
        .order("name");
      if (filter === "signed") q = q.eq("signed", true);
      else if (filter === "unsigned") q = q.eq("signed", false);
      else if (filter === "starred") q = q.eq("starred", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        socials: (r.socials && typeof r.socials === "object" ? r.socials : {}) as Record<string, string>,
      }));
    },
  });
}

export function useAddCreatorToCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { campaign_id: string; creator_id: string }) => {
      const { error } = await supabase.from("campaign_creators").insert({
        campaign_id: args.campaign_id,
        creator_id: args.creator_id,
      });
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["campaign-creators", vars.campaign_id] });
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
    },
  });
}

export function useBulkSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("creators")
        .update({ signed: true, signed_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`Signed ${count} lead${count === 1 ? "" : "s"} to Roster`);
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Bulk sign failed: ${(e as Error).message}`),
  });
}

export function useBulkDeleteCreators() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Grab names first so we can also remove from the Google Sheet.
      const { data: rows } = await supabase
        .from("creators")
        .select("name")
        .in("id", ids);
      const names = (rows ?? []).map((r) => r.name).filter(Boolean);

      const { error } = await supabase
        .from("creators")
        .delete()
        .in("id", ids);
      if (error) throw error;

      // Mirror to Google Sheet — remove each deleted creator from the sheet.
      // Errors here are logged but don't fail the Supabase delete.
      for (const name of names) {
        try {
          await apiFetch("/api/remove_duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
        } catch (e) {
          console.warn(`[sheet-sync] failed to remove ${name} from sheet:`, e);
        }
      }

      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(
        `Deleted ${count} lead${count === 1 ? "" : "s"} (dashboard + sheet)`,
      );
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Bulk delete failed: ${(e as Error).message}`),
  });
}

export function useBulkSetOutreachStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids: string[]; status: string | null }) => {
      const { error } = await supabase
        .from("creators")
        .update({ outreach_status: args.status })
        .in("id", args.ids);
      if (error) throw error;

      // Mirror to Google Sheet — fetch names for the updated rows and push one
      // per creator. Errors here don't fail the primary mutation.
      const { data: rows } = await supabase
        .from("creators")
        .select("name")
        .in("id", args.ids);
      for (const r of rows ?? []) {
        syncCreatorField(r.name, "outreach_status", args.status);
      }

      return args.ids.length;
    },
    onSuccess: (count, vars) => {
      toast.success(
        `Set ${count} lead${count === 1 ? "" : "s"} to "${vars.status ?? "—"}"`,
      );
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Bulk status update failed: ${(e as Error).message}`),
  });
}

export function useToggleStarred() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; starred: boolean }) => {
      const { error } = await supabase
        .from("creators")
        .update({ starred: args.starred })
        .eq("id", args.id);
      if (error) throw error;
      return args.starred;
    },
    onSuccess: (starred) => {
      toast.success(starred ? "Added to Potential" : "Removed from Potential");
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Star failed: ${(e as Error).message}`),
  });
}

export function useSetCreatorSigned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      signed: boolean;
      contract_terms?: string | null;
    }) => {
      const { error } = await supabase
        .from("creators")
        .update({
          signed: args.signed,
          signed_at: args.signed ? new Date().toISOString() : null,
          contract_terms:
            args.contract_terms !== undefined ? args.contract_terms : undefined,
        })
        .eq("id", args.id);
      if (error) throw error;
      return args.signed;
    },
    onSuccess: (signed) => {
      toast.success(signed ? "Signed to Roster" : "Moved to Leads");
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });
}

export function useUpdateContractTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; contract_terms: string | null }) => {
      const { error } = await supabase
        .from("creators")
        .update({ contract_terms: args.contract_terms })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contract terms saved");
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Phase J profile expansion — full editable profile per creator
// ─────────────────────────────────────────────────────────────────────

/** What can be edited via the Creator Profile dialog. */
export interface CreatorProfilePatch {
  legal_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_method_pref?: string | null;
  tax_id?: string | null;
  /** Phase K-2: per-platform commission. Each value is either:
   *  - a flat percentage number (e.g. 30)
   *  - null (no deal on that platform)
   *  - an array of {threshold, pct} tier rows (cliff semantics) */
  commission_pct_by_platform?: Record<
    string,
    number | null | Array<{ threshold: number; pct: number }>
  >;
  /** Round 3 (Gustavo, migration 0034): clickable agreement URLs per
   *  platform. Shape: { platform_slug: url }. Empty/missing keys mean
   *  "no agreement on file yet" — the talent profile UI shows them as
   *  empty input rows with no Open button. */
  agreement_links?: Record<string, string>;
  /** Round 3 Q1+Q7 (migration 0035): canonical tier shape. Each
   *  platform's array ascends by threshold; the last entry has
   *  threshold:null meaning "and above". Progressive math by default;
   *  cliff when commission_uses_cliff is true. */
  commission_tiers?: Record<
    string,
    Array<{ threshold: number | null; pct: number }>
  >;
  /** Round 3 Q1 (migration 0035): TRUE = legacy cliff math for this
   *  creator (whole month at the highest reached tier's pct). FALSE
   *  = progressive (each tier bills its own slice). */
  commission_uses_cliff?: boolean;
  /** Allow the dialog to also tweak the everyday fields. */
  name?: string;
  country?: string | null;
  category?: string | null;
  contract_terms?: string | null;
  socials?: Record<string, string>;
}

export function useUpdateCreatorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: CreatorProfilePatch }) => {
      const { data, error } = await supabase
        .from("creators")
        .update(args.patch)
        .eq("id", args.id)
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      toast.success(`${r?.name ?? "Creator"} updated`);
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });
}

export interface CreatorInput {
  name: string;
  category?: string | null;
  signed: boolean;
  contract_terms?: string | null;
  country?: string | null;
  tier?: string | null;
  socials?: Record<string, string>;
}

export function useCreateCreator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreatorInput) => {
      const twitchHandle = extractHandle(args.socials?.twitch, "twitch.tv");
      const kickHandle = extractHandle(args.socials?.kick, "kick.com");
      const instagramHandle = extractHandle(args.socials?.instagram, "instagram.com");
      const twitterHandle = extractHandle(args.socials?.twitter, "x.com");

      const { data, error } = await supabase
        .from("creators")
        .insert({
          name: args.name,
          category: args.category?.trim() || null,
          signed: args.signed,
          signed_at: args.signed ? new Date().toISOString() : null,
          contract_terms: args.contract_terms?.trim() || null,
          country: args.country?.trim() || null,
          tier: args.tier?.trim() || null,
          socials: args.socials ?? {},
          twitch_handle: twitchHandle,
          kick_handle: kickHandle,
          instagram: instagramHandle,
          twitter: twitterHandle,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Mirror to Google Sheet — append a row via /api/export_to_roster
      // (picks the primary platform), then backfill any secondary handle /
      // socials via /api/update_creator. Errors here don't fail the insert.
      const primaryPlatform = twitchHandle ? "twitch" : kickHandle ? "kick" : "";
      const primaryHandle = twitchHandle ?? kickHandle ?? "";
      try {
        if (primaryHandle) {
          await apiFetch("/api/export_to_roster", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creators: [
                {
                  name: args.name,
                  platform: primaryPlatform,
                  handle: primaryHandle,
                  ccv: 0,
                  country: args.country ?? "",
                  content: args.category ?? "",
                  twitter: args.socials?.twitter ?? "",
                  instagram: args.socials?.instagram ?? "",
                  language: "",
                },
              ],
            }),
          });
        }
        // Fill in secondary platform + misc fields the append missed.
        if (twitchHandle && kickHandle) {
          const secondary = primaryPlatform === "twitch" ? "kick_handle" : "twitch_handle";
          const value = primaryPlatform === "twitch" ? kickHandle : twitchHandle;
          syncCreatorField(args.name, secondary as any, value);
        }
        if (args.country)
          syncCreatorField(args.name, "country", args.country);
        if (args.category)
          syncCreatorField(args.name, "content_type", args.category);
      } catch (e) {
        console.warn("[sheet-sync] create creator push failed:", e);
      }

      return { id: data.id, signed: args.signed, name: args.name };
    },
    onSuccess: (r) => {
      toast.success(`${r.name} added to ${r.signed ? "Roster" : "Leads"}`);
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
    onError: (e) => toast.error(`Add failed: ${(e as Error).message}`),
  });
}

export function useUpdateTwitch30dCCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; ccv: number | null; name?: string }) => {
      const { error } = await supabase
        .from("creators")
        .update({
          twitch_30d_ccv: args.ccv,
          ccv_fetched_at: new Date().toISOString(),
        })
        .eq("id", args.id);
      if (error) throw error;
      if (args.name) syncCreatorField(args.name, "twitch_30d_ccv", args.ccv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
  });
}

interface SheetRoster {
  ok: boolean;
  data: {
    name: string;
    twitchHandle?: string;
    kickHandle?: string;
    twitch30dCCV?: number | null;
    kick30dCCV?: number | null;
  }[];
}

export function useBackfillCCVFromSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{
      matched: number;
      updated: number;
      missed: number;
      total: number;
    }> => {
      const res = await apiFetch("/api/roster");
      if (!res.ok) throw new Error(`/api/roster returned ${res.status}`);
      const sheet = (await res.json()) as SheetRoster;
      if (!sheet?.ok) throw new Error("Sheet read failed");

      const { data: creators, error } = await supabase
        .from("creators")
        .select("id, name, twitch_handle, kick_handle");
      if (error) throw error;

      const byTwitch = new Map<string, string>();
      const byKick = new Map<string, string>();
      const byName = new Map<string, string>();
      for (const c of creators ?? []) {
        if (c.twitch_handle)
          byTwitch.set(c.twitch_handle.toLowerCase(), c.id);
        if (c.kick_handle) byKick.set(c.kick_handle.toLowerCase(), c.id);
        if (c.name) byName.set(c.name.trim().toLowerCase(), c.id);
      }

      let matched = 0;
      let updated = 0;
      let missed = 0;

      for (const row of sheet.data) {
        const tw = row.twitch30dCCV;
        const kk = row.kick30dCCV;
        if (tw == null && kk == null) continue;

        let id: string | undefined;
        if (row.twitchHandle) id = byTwitch.get(row.twitchHandle.toLowerCase());
        if (!id && row.kickHandle) id = byKick.get(row.kickHandle.toLowerCase());
        if (!id && row.name) id = byName.get(row.name.trim().toLowerCase());

        if (!id) {
          missed++;
          continue;
        }
        matched++;

        const patch: Record<string, unknown> = {
          ccv_fetched_at: new Date().toISOString(),
        };
        if (tw != null && Number.isFinite(tw)) patch.twitch_30d_ccv = Math.round(tw);
        if (kk != null && Number.isFinite(kk)) patch.kick_30d_ccv = Math.round(kk);

        const { error: ue } = await supabase
          .from("creators")
          .update(patch)
          .eq("id", id);
        if (!ue) updated++;
      }

      return { matched, updated, missed, total: sheet.data.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
  });
}

export function useFetchAllTwitchCCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      creators: {
        id: string;
        name?: string;
        twitch_handle: string | null;
        twitch_30d_ccv: number | null;
      }[];
      onlyMissing?: boolean;
    }): Promise<{
      attempted: number;
      updated: number;
      skipped: number;
      failed: number;
    }> => {
      let targets = args.creators.filter((c) => !!c.twitch_handle) as {
        id: string;
        name?: string;
        twitch_handle: string;
        twitch_30d_ccv: number | null;
      }[];

      if (args.onlyMissing) {
        targets = targets.filter(
          (c) => c.twitch_30d_ccv == null || c.twitch_30d_ccv === 0,
        );
      }

      let attempted = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      for (const c of targets) {
        attempted++;
        try {
          const res = await fetch(
            `/api/ccv30?platform=twitch&handle=${encodeURIComponent(c.twitch_handle)}`,
          );
          if (!res.ok) {
            failed++;
            continue;
          }
          const data = await res.json();
          const ccv = data?.ccv30 ?? null;

          // Only overwrite when the fresh value is a meaningful number.
          // If TwitchTracker returns 0 or null (inactive/missing), keep the
          // existing value — scout history is more useful than today's zero.
          if (ccv == null || ccv === 0) {
            skipped++;
            continue;
          }

          const { error } = await supabase
            .from("creators")
            .update({
              twitch_30d_ccv: ccv,
              ccv_fetched_at: new Date().toISOString(),
            })
            .eq("id", c.id);
          if (error) {
            failed++;
          } else {
            updated++;
            if (c.name) syncCreatorField(c.name, "twitch_30d_ccv", ccv);
          }
        } catch {
          failed++;
        }
      }

      return { attempted, updated, skipped, failed };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
  });
}

export function useFetchTwitch30dCCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; handle: string; name?: string }) => {
      const res = await fetch(
        `/api/ccv30?platform=twitch&handle=${encodeURIComponent(args.handle)}`,
      );
      if (!res.ok) throw new Error(`/api/ccv30 returned ${res.status}`);
      const data = await res.json();
      const ccv = data?.ccv30 ?? null;
      const { error } = await supabase
        .from("creators")
        .update({
          twitch_30d_ccv: ccv,
          ccv_fetched_at: new Date().toISOString(),
        })
        .eq("id", args.id);
      if (error) throw error;
      if (args.name && ccv != null) {
        syncCreatorField(args.name, "twitch_30d_ccv", ccv);
      }
      return ccv as number | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
  });
}

export function useUpdateKick30dCCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; ccv: number | null; name?: string }) => {
      const { error } = await supabase
        .from("creators")
        .update({
          kick_30d_ccv: args.ccv,
          ccv_fetched_at: new Date().toISOString(),
        })
        .eq("id", args.id);
      if (error) throw error;
      if (args.name) syncCreatorField(args.name, "kick_30d_ccv", args.ccv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creators"] });
    },
  });
}

function extractHandle(url: string | undefined, _host: string): string | null {
  if (!url) return null;
  const clean = url.split("?")[0].replace(/\/+$/, "");
  const segs = clean.split("/");
  const last = segs[segs.length - 1];
  if (!last) return null;
  return last.startsWith("@") ? last.slice(1) : last;
}
