import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsertTelePeriod, type TeleDealRow } from "@/hooks/useTeleDeals";
import { calcTelePeriod, tiersFromProfile } from "@/lib/finance/calc";
import { formatUSD } from "@/lib/utils";
import type {
  CommissionBasis,
  TelePeriodPerformance,
} from "@/types/finance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: TeleDealRow;
  year: number;
  month: number;
  existing: TelePeriodPerformance | null;
}

/**
 * Edit a single Telegram month cell. Shows a live calc preview as the
 * user types — gross + (optional override of) net + status. The MG
 * top-up, qualified flag, and commission are all derived.
 */
export function TelePeriodCellDialog({
  open, onOpenChange, deal, year, month, existing,
}: Props) {
  const upsert = useUpsertTelePeriod();
  const [gross, setGross] = React.useState("");
  const [netOverride, setNetOverride] = React.useState("");
  const [useOverride, setUseOverride] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setGross(existing?.gross_revenue != null ? String(existing.gross_revenue) : "");
    if (existing?.net_revenue != null && existing.gross_revenue != null) {
      const isStandard = Math.abs(existing.net_revenue - existing.gross_revenue * 0.5) < 0.01;
      setUseOverride(!isStandard);
      setNetOverride(isStandard ? "" : String(existing.net_revenue));
    } else {
      setUseOverride(false);
      setNetOverride("");
    }
  }, [open, existing]);

  const grossNum = Number(gross) || 0;
  // R3 Q1+Q7: tiers resolved from canonical commission_tiers column
  // first (legacy fallback inside tiersFromProfile). Mode reads the
  // per-creator commission_uses_cliff flag — false (default) = the
  // new progressive math, true = the K-2 cliff behaviour for
  // grandfathered contracts. When tiers exist they override the
  // deal's flat pct; without tiers the deal pct is authoritative.
  const tiers = React.useMemo(
    () => tiersFromProfile(deal.creator, "telegram"),
    [deal.creator],
  );
  const commissionMode = deal.creator?.commission_uses_cliff
    ? "cliff"
    : "progressive";
  // R5 Sweep 2 (Gustavo, T1, migration 0042): MG lives on the creator
  // profile now. Read from creator first; fall back to legacy deal-
  // level value for backward-compat with rows pre-dating the move.
  const effectiveMG =
    deal.creator?.min_guarantee != null
      ? Number(deal.creator.min_guarantee)
      : deal.min_guarantee;
  const preview = React.useMemo(
    () =>
      calcTelePeriod({
        gross_revenue: grossNum,
        net_revenue: useOverride && netOverride.trim() ? Number(netOverride) : undefined,
        recast_commission_pct: deal.recast_commission_pct,
        commission_basis: deal.commission_basis as CommissionBasis,
        min_guarantee: effectiveMG,
        tiers,
        commissionMode,
      }),
    [grossNum, useOverride, netOverride, deal, tiers, commissionMode, effectiveMG],
  );

  async function onSave() {
    if (grossNum < 0) {
      toast.error("Gross revenue can't be negative.");
      return;
    }
    try {
      // R5 Sweep 1 (Gustavo, T1): status / paid_at / notes preserved
      // on edit but no longer surfaced in the calculator dialog —
      // payment status lives on the future /payments page (Sweep 5).
      await upsert.mutateAsync({
        creator_id: deal.creator_id,
        period_year: year,
        period_month: month,
        gross_revenue: grossNum,
        net_revenue: useOverride && netOverride.trim() ? Number(netOverride) : undefined,
        status: existing?.status,
        paid_at: existing?.paid_at ?? null,
        notes: existing?.notes ?? null,
        recast_commission_pct: deal.recast_commission_pct,
        commission_basis: deal.commission_basis as CommissionBasis,
        // R5 Sweep 2: effective MG (creator profile first, deal as
        // fallback). See `effectiveMG` above the preview useMemo.
        min_guarantee: effectiveMG,
        tiers,
        commissionMode,
      });
      toast.success(`${MONTH_NAMES[month - 1]} ${year} updated`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{MONTH_NAMES[month - 1]} {year} — Telegram</DialogTitle>
          <DialogDescription>
            Enter gross revenue. Net (50% of gross), MG top-up, qualified flag,
            and Recast's commission are computed from the deal terms.
          </DialogDescription>
        </DialogHeader>

        {/* R5 Sweep 2 (Gustavo, T1): paste-and-go. Enter submits from
            either input. */}
        <form
          className="grid gap-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="tp-gross">Gross revenue</Label>
            <Input
              id="tp-gross"
              type="number"
              step="0.01"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={useOverride}
              onChange={(e) => setUseOverride(e.target.checked)}
            />
            Override net (default = 50% of gross)
          </label>
          {useOverride && (
            <Input
              type="number"
              step="0.01"
              value={netOverride}
              onChange={(e) => setNetOverride(e.target.value)}
              placeholder="Manual net amount"
            />
          )}

          {/* R5 Sweep 1: status / paid date / notes removed per T1
              "this is literally just a calculator". Payment status
              lives on the future /payments page. */}

          {/* Live calc preview */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">
              Calculation
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <Stat label="Net (50% of gross)" value={formatUSD(preview.net_revenue, { decimals: 2 })} />
              <Stat
                label="MG qualifier"
                value={
                  deal.min_guarantee
                    ? `${preview.qualified_for_mg ? "✅" : "❌"} ${formatUSD(deal.min_guarantee * 0.5, { decimals: 0 })}`
                    : "—"
                }
              />
              <Stat
                label="Top-up"
                value={preview.mg_top_up > 0 ? formatUSD(preview.mg_top_up, { decimals: 2 }) : "—"}
                emphasised={preview.mg_top_up > 0}
              />
              <Stat
                label={`Recast commission (${deal.recast_commission_pct}% on ${deal.commission_basis})`}
                value={formatUSD(preview.recast_commission, { decimals: 2 })}
              />
              <Stat
                label="Creator take-home"
                value={formatUSD(preview.creator_take_home, { decimals: 2 })}
                emphasised
              />
            </dl>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasised ? "font-semibold text-foreground" : "text-foreground"}>{value}</dd>
    </>
  );
}
