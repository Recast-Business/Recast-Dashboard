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
import { useUpsertTelePeriod, type TeleDealRow } from "@/hooks/useTeleDeals";
import { calcTelePeriod, tiersFromProfile } from "@/lib/finance/calc";
import { formatUSD } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import type {
  CommissionBasis,
  PaymentStatusV2,
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
  const [status, setStatus] = React.useState<PaymentStatusV2>("unpaid");
  const [paidAt, setPaidAt] = React.useState("");
  const [notes, setNotes] = React.useState("");

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
    setStatus(existing?.status ?? "unpaid");
    setPaidAt(existing?.paid_at ?? "");
    setNotes(existing?.notes ?? "");
  }, [open, existing]);

  const grossNum = Number(gross) || 0;
  // Phase K-2: pull tiered commission from the creator's profile.
  // When tiers exist, calcTelePeriod uses cliff semantics and the deal's
  // flat pct is ignored; otherwise the deal's flat pct is authoritative.
  const tiers = React.useMemo(
    () => tiersFromProfile(deal.creator?.commission_pct_by_platform, "telegram"),
    [deal.creator?.commission_pct_by_platform],
  );
  const preview = React.useMemo(
    () =>
      calcTelePeriod({
        gross_revenue: grossNum,
        net_revenue: useOverride && netOverride.trim() ? Number(netOverride) : undefined,
        recast_commission_pct: deal.recast_commission_pct,
        commission_basis: deal.commission_basis as CommissionBasis,
        min_guarantee: deal.min_guarantee,
        tiers,
      }),
    [grossNum, useOverride, netOverride, deal, tiers],
  );

  async function onSave() {
    if (grossNum < 0) {
      toast.error("Gross revenue can't be negative.");
      return;
    }
    try {
      await upsert.mutateAsync({
        creator_id: deal.creator_id,
        period_year: year,
        period_month: month,
        gross_revenue: grossNum,
        net_revenue: useOverride && netOverride.trim() ? Number(netOverride) : undefined,
        status,
        paid_at: paidAt || null,
        notes: notes.trim() || null,
        recast_commission_pct: deal.recast_commission_pct,
        commission_basis: deal.commission_basis as CommissionBasis,
        min_guarantee: deal.min_guarantee,
        tiers,
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

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tp-paid">Paid date</Label>
              <DatePicker id="tp-paid" value={paidAt} onChange={(v) => setPaidAt(v ?? "")} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tp-notes">Notes</Label>
            <textarea
              id="tp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

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
      <dd className={emphasised ? "font-semibold text-foreground" : "text-foreground"}>{value}</dd>
    </>
  );
}
