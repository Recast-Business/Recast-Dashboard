import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { TaxRecord, TaxSubjectKind } from "@/types/finance";

/**
 * Round 4 B — year-end tax tracker hooks.
 *
 * Surface:
 *   • useTaxTrackerSubjects(year)
 *       Returns every creator + vendor with requires_tax_info=true,
 *       joined with their tax_record row for the given year (if any).
 *       This is what /tax renders.
 *
 *   • useUpsertTaxRecord()
 *       Upserts a (subject_kind, subject_id, year) row. Manual entry
 *       only — there's no auto-calc.
 *
 *   • useUpdateSubjectTax()
 *       Patches the W9 fields + requires_tax_info on creators/vendors.
 *       Splits two queries (one per source table) since the column
 *       lists are identical but the table names aren't.
 */

export interface TaxTrackerRow {
  subject_kind: TaxSubjectKind;
  subject_id: string;
  /** Display name from the source table. */
  name: string;
  /** Vendors carry their own kind ('vendor' vs 'talent_we_pay');
   *  null for creators. Lets the UI label rows accordingly. */
  vendor_kind: "vendor" | "talent_we_pay" | null;
  /** Subject-level W9 fields. */
  w9_url: string | null;
  w9_received_at: string | null;
  /** Year-specific record. Null when no 1099 has been logged for
   *  this subject + year yet. */
  record: TaxRecord | null;
}

export function useTaxTrackerSubjects(year: number) {
  return useQuery({
    queryKey: ["tax-tracker", "subjects", year],
    queryFn: async (): Promise<TaxTrackerRow[]> => {
      const [creatorsRes, vendorsRes, recordsRes] = await Promise.all([
        supabase
          .from("creators")
          .select("id, name, w9_url, w9_received_at")
          .eq("requires_tax_info", true)
          .order("name"),
        supabase
          .from("vendors")
          .select("id, name, kind, w9_url, w9_received_at")
          .eq("requires_tax_info", true)
          .order("name"),
        supabase
          .from("tax_records")
          .select("*")
          .eq("year", year),
      ]);
      if (creatorsRes.error) throw creatorsRes.error;
      if (vendorsRes.error) throw vendorsRes.error;
      if (recordsRes.error) throw recordsRes.error;

      // Build lookup: `${subject_kind}|${subject_id}` → TaxRecord
      const recordMap = new Map<string, TaxRecord>();
      for (const r of (recordsRes.data ?? []) as TaxRecord[]) {
        recordMap.set(`${r.subject_kind}|${r.subject_id}`, r);
      }

      const rows: TaxTrackerRow[] = [];
      for (const c of creatorsRes.data ?? []) {
        rows.push({
          subject_kind: "creator",
          subject_id: c.id,
          name: c.name,
          vendor_kind: null,
          w9_url: c.w9_url,
          w9_received_at: c.w9_received_at,
          record: recordMap.get(`creator|${c.id}`) ?? null,
        });
      }
      for (const v of vendorsRes.data ?? []) {
        rows.push({
          subject_kind: "vendor",
          subject_id: v.id,
          name: v.name,
          vendor_kind: (v.kind ?? "vendor") as "vendor" | "talent_we_pay",
          w9_url: v.w9_url,
          w9_received_at: v.w9_received_at,
          record: recordMap.get(`vendor|${v.id}`) ?? null,
        });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
  });
}

export interface TaxRecordPatch {
  subject_kind: TaxSubjectKind;
  subject_id: string;
  year: number;
  amount_reported?: number | null;
  ten99_url?: string | null;
  ten99_sent_at?: string | null;
  notes?: string | null;
}

export function useUpsertTaxRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TaxRecordPatch) => {
      const { error } = await supabase
        .from("tax_records")
        .upsert(patch, { onConflict: "subject_kind,subject_id,year" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Tax record updated");
      qc.invalidateQueries({ queryKey: ["tax-tracker", "subjects", vars.year] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });
}

export interface SubjectW9Patch {
  subject_kind: TaxSubjectKind;
  subject_id: string;
  /** Mark as received (sets timestamp to now() server-side via a
   *  client-stamped value to avoid round-tripping). Pass null to clear. */
  w9_received_at?: string | null;
  w9_url?: string | null;
  requires_tax_info?: boolean;
}

export function useUpdateSubjectTax() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SubjectW9Patch) => {
      const { subject_kind, subject_id, ...rest } = patch;
      const table = subject_kind === "creator" ? "creators" : "vendors";
      const { error } = await supabase
        .from(table)
        .update(rest)
        .eq("id", subject_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tax profile updated");
      qc.invalidateQueries({ queryKey: ["tax-tracker"] });
      qc.invalidateQueries({ queryKey: ["creators"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });
}
