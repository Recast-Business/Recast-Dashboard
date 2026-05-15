import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  planCombinedAllocation,
  utilityMonthTotal,
  utilityShareForResident,
} from "@/lib/finance/houseShare";
import type {
  HouseResident,
  HouseRentPayment,
  HouseUtilityPayment,
  PaymentMethod,
} from "@/types/finance";

/**
 * R5 follow-up (Gus #5 + #7) — combined rent + utility payment.
 *
 * Replaces the M-3 "log a single house_rent receipt and FIFO-allocate
 * against rent only" flow. New behaviour: one logged amount settles
 * BOTH the resident's rent and their utility share, walking oldest
 * unpaid combined months first and splitting proportionally per
 * month. Rounding diff lands on the larger of (rent, utility) per
 * Gus's rule.
 *
 * Implementation lives client-side (no migration). For each step
 * produced by planCombinedAllocation we:
 *
 *   1. Insert a house_rent receipt for that month's rent portion
 *      (skipped when rent_apply = 0).
 *   2. Insert one house_utility receipt PER utility for that month,
 *      with each receipt's amount = resident's per-utility share of
 *      utility_apply, proportional to that utility's bill weight
 *      within the month's utility total.
 *
 * Each receipt is then auto-allocated via allocate_fifo. The existing
 * reconcile_period_status trigger picks it up and updates the right
 * (rent | utility)_payments row's amount_paid + status.
 *
 * Trade-offs vs a single atomic RPC:
 *   + No DB migration.
 *   + Reuses every existing primitive (allocate_fifo, reconcile
 *     trigger, payment_receipts source semantics).
 *   − Not transactionally atomic. If a mid-flight insert fails, the
 *     resident sees partial state and would re-submit. The mutation
 *     toasts a clear error and the user can retry. Promote to an
 *     RPC if/when the failure mode bites.
 */

interface LogHouseCombinedInput {
  resident_id: string;
  amount: number;
  received_at: string; // YYYY-MM-DD
  method?: PaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
  // Snapshot data needed to plan the allocation client-side. The
  // dialog passes these in directly so the hook stays a pure
  // computation + sequential insert routine.
  residents: HouseResident[];
  rentForResident: Record<number, HouseRentPayment> | undefined; // by month
  utilByUtility: Record<string, Record<number, HouseUtilityPayment>> | undefined;
  /** Year scope for the plan (the rent + utility maps are 1-indexed
   *  month → row for this year). */
  year: number;
}

interface LogHouseCombinedResult {
  receipts_created: number;
  steps: { period_year: number; period_month: number; rent_apply: number; utility_apply: number }[];
  unallocated: number;
}

export function useLogHouseCombinedPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogHouseCombinedInput): Promise<LogHouseCombinedResult> => {
      const residentIdx = input.residents.findIndex(
        (r) => r.id === input.resident_id,
      );
      if (residentIdx < 0) {
        throw new Error("Pick a resident before logging a payment.");
      }

      // ──────────────────────────────────────────────────────────
      // Build the per-month combined-owed snapshot for the year.
      // ──────────────────────────────────────────────────────────
      const owedByMonth: {
        period_year: number;
        period_month: number;
        rent_owed: number;
        utility_owed: number;
      }[] = [];
      for (let m = 1; m <= 12; m++) {
        const rentRow = input.rentForResident?.[m];
        const rentOwed = rentRow
          ? Math.max(0, (Number(rentRow.amount) || 0) - (Number(rentRow.amount_paid) || 0))
          : 0;
        const monthTotal = utilityMonthTotal(input.utilByUtility, m);
        const utilShareFull = utilityShareForResident({
          residents: input.residents,
          residentIdx,
          monthTotal,
        });
        // Subtract whatever's already been allocated to utilities
        // this month for this resident. Simplification: we don't
        // currently track per-resident utility paid (receipts have
        // utility_id, not resident_id). Best-effort approximation:
        // we use the utility-row amount_paid divided by head count
        // as the resident's already-paid utility share. Accurate
        // when every resident paid their share evenly; off if some
        // are behind. Promote to a per-resident utility ledger in a
        // future sweep if reconciliation drift becomes a problem.
        let utilPaidShare = 0;
        if (input.utilByUtility) {
          for (const utilityId of Object.keys(input.utilByUtility)) {
            const row = input.utilByUtility[utilityId]?.[m];
            if (!row) continue;
            const paid = Number(row.amount_paid) || 0;
            utilPaidShare += paid / Math.max(input.residents.length, 1);
          }
        }
        const utilOwed = Math.max(0, utilShareFull - utilPaidShare);
        owedByMonth.push({
          period_year: input.year,
          period_month: m,
          rent_owed: rentOwed,
          utility_owed: utilOwed,
        });
      }

      // ──────────────────────────────────────────────────────────
      // Plan + execute.
      // ──────────────────────────────────────────────────────────
      const plan = planCombinedAllocation({
        amount: input.amount,
        owedByMonth,
      });

      let receiptsCreated = 0;
      for (const step of plan.steps) {
        // Rent receipt (skip if nothing to apply this month).
        if (step.rent_apply > 0) {
          const { data: rentReceipt, error: rentErr } = await supabase
            .from("payment_receipts")
            .insert({
              source: "house_rent",
              resident_id: input.resident_id,
              received_at: input.received_at,
              amount: step.rent_apply,
              method: input.method ?? null,
              reference: input.reference ?? null,
              notes:
                input.notes ??
                `Combined house payment · rent · ${step.period_year}-${String(step.period_month).padStart(2, "0")}`,
            })
            .select("id")
            .single();
          if (rentErr) throw rentErr;
          const { error: rentAllocErr } = await supabase.rpc("allocate_fifo", {
            p_receipt_id: (rentReceipt as { id: string }).id,
          });
          if (rentAllocErr) throw rentAllocErr;
          receiptsCreated++;
        }

        // Utility receipts — one per utility, weighted by that
        // utility's slice of the month's utility total.
        if (step.utility_apply > 0 && input.utilByUtility) {
          const monthTotal = utilityMonthTotal(input.utilByUtility, step.period_month);
          if (monthTotal > 0) {
            // Cents for clean rounding without floating-point drift.
            const applyCents = Math.round(step.utility_apply * 100);
            const totalCents = Math.round(monthTotal * 100);
            // Walk utilities in stable order; assign floor share for
            // each except the last, which absorbs the remainder so
            // the row-by-row sum reconciles to applyCents exactly.
            const utilityIds = Object.keys(input.utilByUtility);
            const splits: { utility_id: string; amount: number }[] = [];
            let assignedCents = 0;
            utilityIds.forEach((utilityId, idx) => {
              const row = input.utilByUtility?.[utilityId]?.[step.period_month];
              const utilAmtCents = Math.round((Number(row?.amount) || 0) * 100);
              const isLast = idx === utilityIds.length - 1;
              let cents = isLast
                ? applyCents - assignedCents
                : Math.floor((applyCents * utilAmtCents) / totalCents);
              if (cents < 0) cents = 0;
              assignedCents += cents;
              if (cents > 0) {
                splits.push({ utility_id: utilityId, amount: cents / 100 });
              }
            });
            for (const split of splits) {
              const { data: utilReceipt, error: utilErr } = await supabase
                .from("payment_receipts")
                .insert({
                  source: "house_utility",
                  utility_id: split.utility_id,
                  received_at: input.received_at,
                  amount: split.amount,
                  method: input.method ?? null,
                  reference: input.reference ?? null,
                  notes:
                    input.notes ??
                    `Combined house payment · utility · resident=${input.resident_id} · ${step.period_year}-${String(step.period_month).padStart(2, "0")}`,
                })
                .select("id")
                .single();
              if (utilErr) throw utilErr;
              const { error: utilAllocErr } = await supabase.rpc(
                "allocate_fifo",
                { p_receipt_id: (utilReceipt as { id: string }).id },
              );
              if (utilAllocErr) throw utilAllocErr;
              receiptsCreated++;
            }
          }
        }
      }

      return {
        receipts_created: receiptsCreated,
        steps: plan.steps,
        unallocated: plan.unallocated,
      };
    },
    onSuccess: () => {
      // Touch every query that watches rent + utility state plus the
      // receipt ledger so the UI catches up immediately.
      qc.invalidateQueries({ queryKey: ["payment-receipts"] });
      qc.invalidateQueries({ queryKey: ["house"] });
      qc.invalidateQueries({ queryKey: ["overdue-rows"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e) =>
      toast.error(`Log house payment failed: ${(e as Error).message}`),
  });
}
