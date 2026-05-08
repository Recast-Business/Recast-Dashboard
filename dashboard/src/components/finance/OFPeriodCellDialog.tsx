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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpsertOFPeriod } from "@/hooks/useOFDeals";
import { calcOFPeriod } from "@/lib/finance/calc";
import { formatUSD } from "@/lib/utils";
import type {
  CommissionBasis,
  OFDeal,
  OFPeriodPerformance,
  PaymentStatusV2,
} from "@/types/finance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: OFDeal;
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
  const [status, setStatus] = React.useState<PaymentStatusV2>("unpaid");
  const [paidAt, setPaidAt] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setGross(existing?.gross_revenue != null ? String(existing.gross_revenue) : "");
    setNet(existing?.net_revenue != null ? String(existing.net_revenue) : "");
    setStatus(existing?.status ?? "unpaid");
    setPaidAt(existing?.paid_at ?? "");
    setNotes(existing?.notes ?? "");
  }, [open, existing]);

  const grossNum = Number(gross) || 0;
  const netNum = net.trim() ? Number(net) : grossNum;
  const preview = React.useMemo(
    () =>
      calcOFPeriod({
        gross_revenue: grossNum,
        net_revenue: netNum,
        recast_pct: deal.recast_pct,
        basis: deal.basis as CommissionBasis,
      }),
    [grossNum, netNum, deal],
  );

  async function onSave() {
    if (grossNum < 0 || netNum < 0) {
      toast.error("Revenue can't be negative.");
      return;
    }
    try {
      await upsert.mutateAsync({
        of_deal_id: deal.id,
        period_year: year,
        period_month: month,
        gross_revenue: grossNum,
        net_revenue: net.trim() ? netNum : undefined,
        status,
        paid_at: paidAt || null,
        notes: notes.trim() || null,
        recast_pct: deal.recast_pct,
        basis: deal.basis as CommissionBasis,
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

        <div className="grid gap-3 py-2">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatusV2)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="op-paid">Paid date</Label>
              <Input
                id="op-paid"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="op-notes">Notes</Label>
            <textarea
              id="op-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

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
        </div>

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
