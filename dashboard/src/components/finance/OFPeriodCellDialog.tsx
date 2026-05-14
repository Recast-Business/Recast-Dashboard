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
import { useUpsertOFPeriod, type OFDealRow } from "@/hooks/useOFDeals";
import { calcOFPeriod, tiersFromProfile } from "@/lib/finance/calc";
import { formatUSD } from "@/lib/utils";
import type {
  CommissionBasis,
  OFPeriodPerformance,
} from "@/types/finance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: OFDealRow;
  year: number;
  month: number;
  existing: OFPeriodPerformance | null;
}

export function OFPeriodCellDialog({
  open, onOpenChange, deal, year, month, existing,
}: Props) {
  const upsert = useUpsertOFPeriod();
  const [gross, setGross] = React.useState("");
  const [net, setNet] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setGross(existing?.gross_revenue != null ? String(existing.gross_revenue) : "");
    setNet(existing?.net_revenue != null ? String(existing.net_revenue) : "");
  }, [open, existing]);

  const grossNum = Number(gross) || 0;
  const netNum = net.trim() ? Number(net) : grossNum;
  // R3 Q1+Q7 (migration 0035): tiers resolved from the new canonical
  // column (commission_tiers) with legacy fallback; mode honours the
  // per-creator commission_uses_cliff flag.
  // R5 Sweep 3c: pass deal.page_name so multi-page OF creators resolve
  // the correct per-page tier set. pickPage() inside tiersFromProfile
  // falls back to "main" then alphabetical-first if the deal's page
  // has no commission row, so single-page creators keep working.
  const tiers = React.useMemo(
    () => tiersFromProfile(deal.creator, "onlyfans", deal.page_name),
    [deal.creator, deal.page_name],
  );
  const commissionMode = deal.creator?.commission_uses_cliff
    ? "cliff"
    : "progressive";
  const preview = React.useMemo(
    () =>
      calcOFPeriod({
        gross_revenue: grossNum,
        net_revenue: netNum,
        recast_pct: deal.recast_pct,
        basis: deal.basis as CommissionBasis,
        tiers,
        commissionMode,
      }),
    [grossNum, netNum, deal, tiers, commissionMode],
  );

  async function onSave() {
    if (grossNum < 0 || netNum < 0) {
      toast.error("Revenue can't be negative.");
      return;
    }
    try {
      // R5 Sweep 1 (Gustavo): status / paid_at / notes are no longer
      // managed from this dialog — the calculator is pure data entry
      // (gross + net) per T1 "this is literally just a calculator".
      // Existing values are preserved on edit; new rows default to
      // status='unpaid' server-side. The new /payments sidebar page
      // (Sweep 5) is where payment status/dates get logged.
      await upsert.mutateAsync({
        of_deal_id: deal.id,
        period_year: year,
        period_month: month,
        gross_revenue: grossNum,
        net_revenue: net.trim() ? netNum : undefined,
        status: existing?.status,
        paid_at: existing?.paid_at ?? null,
        notes: existing?.notes ?? null,
        recast_pct: deal.recast_pct,
        basis: deal.basis as CommissionBasis,
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
          <DialogTitle>{MONTH_NAMES[month - 1]} {year} — OnlyFans</DialogTitle>
          <DialogDescription>
            Enter gross + net (post platform fee). Recast's commission and
            the creator's share are computed live.
          </DialogDescription>
        </DialogHeader>

        {/* R5 Sweep 2 (Gustavo, T1): paste-and-go entry. The form
            wrapper lets Enter submit from either input — Gustavo
            copies a gross number from his data extraction sheet,
            pastes, hits Enter. */}
        <form
          className="grid gap-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="op-gross">Gross revenue</Label>
              <Input
                id="op-gross"
                type="number"
                step="0.01"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="op-net">Net revenue (after OF fee)</Label>
              <Input
                id="op-net"
                type="number"
                step="0.01"
                value={net}
                onChange={(e) => setNet(e.target.value)}
                placeholder="Defaults to gross if blank"
              />
            </div>
          </div>

          {/* R5 Sweep 1 (Gustavo, T1): status / paid date / notes
              removed — "this is literally just a calculator". Period
              year+month at the top is the only date concept needed;
              payment status is managed from the dedicated /payments
              page (Sweep 5). */}

          {/* Live calc */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">
              Calculation
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <Stat label="Gross" value={formatUSD(preview.gross_revenue, { decimals: 2 })} />
              <Stat label="Net" value={formatUSD(preview.net_revenue, { decimals: 2 })} />
              <Stat
                label={`Recast (${deal.recast_pct}% on ${deal.basis})`}
                value={formatUSD(preview.recast_commission, { decimals: 2 })}
              />
              <Stat
                label="Girls share"
                value={formatUSD(preview.girls_share, { decimals: 2 })}
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
      <dd className={emphasised ? "font-semibold" : ""}>{value}</dd>
    </>
  );
}
