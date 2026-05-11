import * as React from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  useLogReceiptFifo,
  useLogReceiptSpecific,
  useReceiptsForObligor,
  type ReceiptInput,
} from "@/hooks/usePaymentReceipts";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase K-3c: Talent receipt dialog.
 *
 * Logs a payment receipt against a Telegram creator (commission owed
 * by the creator to Recast) or an OnlyFans deal (commission owed by
 * the deal to Recast). Differs from the House/Vendor dialog because
 * Gustavo wants to pick the target month explicitly — Telegram MG
 * cycles and OF billing periods don't always map cleanly to a
 * calendar month, so blind FIFO would mis-allocate.
 *
 * Strategy radio:
 *   • "Auto: oldest unpaid first" → calls allocate_fifo on the server.
 *     Fast path; useful when the creator paid the full balance.
 *   • "Specific month" → exposes a dropdown of every unpaid /
 *     partial / overdue period and assigns the receipt to one of
 *     them via allocate_specific.
 */

type Mode =
  | {
      kind: "telegram";
      creatorId: string;
      creatorName: string;
    }
  | {
      kind: "onlyfans";
      ofDealId: string;
      creatorName: string;
      pageName: string;
    };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: Mode;
}

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "auto_pay", label: "Auto-pay" },
  { value: "bank_ach", label: "Bank / ACH" },
  { value: "domestic_wire", label: "Domestic wire" },
  { value: "international_transfer", label: "International transfer" },
  { value: "zelle", label: "Zelle" },
  { value: "paypal", label: "PayPal" },
  { value: "credit_card", label: "Credit card" },
  { value: "invoice_link", label: "Invoice link" },
  { value: "website_link", label: "Website link" },
];

interface OutstandingPeriod {
  period_year: number;
  period_month: number;
  owed: number;
  paid: number;
  remaining: number;
}

/** Fetch all unpaid / partial / overdue periods for the talent obligor.
 *  Used to populate the "Specific month" dropdown and the balance panel. */
function useOutstandingPeriods(mode: Mode, enabled: boolean) {
  return useQuery({
    queryKey: ["talent-outstanding", mode],
    enabled,
    queryFn: async (): Promise<OutstandingPeriod[]> => {
      if (mode.kind === "telegram") {
        const { data, error } = await supabase
          .from("tele_period_performance")
          .select("period_year, period_month, recast_commission, amount_paid, status")
          .eq("creator_id", mode.creatorId)
          .in("status", ["unpaid", "partial", "overdue"])
          .order("period_year", { ascending: true })
          .order("period_month", { ascending: true });
        if (error) throw error;
        return (data ?? []).map((r: any) => {
          const owed = Number(r.recast_commission) || 0;
          const paid = Number(r.amount_paid) || 0;
          return {
            period_year: r.period_year,
            period_month: r.period_month,
            owed,
            paid,
            remaining: Math.max(0, owed - paid),
          };
        });
      }
      const { data, error } = await supabase
        .from("of_period_performance")
        .select("period_year, period_month, recast_commission, amount_paid, status")
        .eq("of_deal_id", mode.ofDealId)
        .in("status", ["unpaid", "partial", "overdue"])
        .order("period_year", { ascending: true })
        .order("period_month", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const owed = Number(r.recast_commission) || 0;
        const paid = Number(r.amount_paid) || 0;
        return {
          period_year: r.period_year,
          period_month: r.period_month,
          owed,
          paid,
          remaining: Math.max(0, owed - paid),
        };
      });
    },
  });
}

function modeTitle(mode: Mode): string {
  switch (mode.kind) {
    case "telegram":
      return `Log Telegram payment — ${mode.creatorName}`;
    case "onlyfans":
      return `Log OnlyFans payment — ${mode.creatorName} · ${mode.pageName}`;
  }
}

function modeReceiptInput(
  mode: Mode,
  base: { received_at: string; amount: number; method: PaymentMethod | null; reference: string | null; notes: string | null },
): ReceiptInput {
  switch (mode.kind) {
    case "telegram":
      return { source: "telegram", creator_id: mode.creatorId, ...base };
    case "onlyfans":
      return { source: "onlyfans", of_deal_id: mode.ofDealId, ...base };
  }
}

function modeObligorRef(mode: Mode) {
  switch (mode.kind) {
    case "telegram":
      return { source: "telegram" as const, creator_id: mode.creatorId };
    case "onlyfans":
      return { source: "onlyfans" as const, of_deal_id: mode.ofDealId };
  }
}

function formatPeriodLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function TalentReceiptDialog({ open, onOpenChange, mode }: Props) {
  const fifo = useLogReceiptFifo();
  const specific = useLogReceiptSpecific();
  const { data: outstanding, isLoading: outstandingLoading } = useOutstandingPeriods(
    mode,
    open,
  );
  const { data: pastReceipts } = useReceiptsForObligor(modeObligorRef(mode), open);

  const today = new Date().toISOString().slice(0, 10);
  const [receivedAt, setReceivedAt] = React.useState(today);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod | "">("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [strategy, setStrategy] = React.useState<"fifo" | "specific">("fifo");
  const [targetPeriod, setTargetPeriod] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;
    setReceivedAt(today);
    setAmount("");
    setMethod("");
    setReference("");
    setNotes("");
    setStrategy("fifo");
    setTargetPeriod("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // When the user picks "Specific month" but hasn't picked a target yet,
  // default to the oldest outstanding period — that's the most common
  // case (paying for last month's commission).
  React.useEffect(() => {
    if (strategy === "specific" && !targetPeriod && outstanding && outstanding.length > 0) {
      const first = outstanding[0];
      setTargetPeriod(`${first.period_year}-${first.period_month}`);
    }
  }, [strategy, targetPeriod, outstanding]);

  const totalOutstanding = (outstanding ?? []).reduce((s, p) => s + p.remaining, 0);
  const submitting = fifo.isPending || specific.isPending;

  async function onSave() {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!receivedAt) {
      toast.error("Pick a received-on date.");
      return;
    }
    const base = {
      received_at: receivedAt,
      amount: num,
      method: method || null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (strategy === "fifo") {
        await fifo.mutateAsync(modeReceiptInput(mode, base));
      } else {
        if (!targetPeriod) {
          toast.error("Pick a target month.");
          return;
        }
        const [yearStr, monthStr] = targetPeriod.split("-");
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (!year || !month) {
          toast.error("Invalid target month.");
          return;
        }
        await specific.mutateAsync({
          receipt: modeReceiptInput(mode, base),
          allocations: [{ period_year: year, period_month: month, amount: num }],
        });
      }
      toast.success(`${formatUSD(num, { decimals: 2 })} logged`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            {modeTitle(mode)}
          </DialogTitle>
          <DialogDescription>
            Log a payment from this creator and decide which month it settles.
            Auto mode pays the oldest unpaid month first; specific mode lets
            you pick — useful when the creator's billing cycle doesn't align
            with the calendar month.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="talent-receipt-date">Received on *</Label>
              <DatePicker
                id="talent-receipt-date"
                value={receivedAt}
                onChange={(v) => setReceivedAt(v ?? "")}
                allowClear={false}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="talent-receipt-amount">Amount (USD) *</Label>
              <Input
                id="talent-receipt-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Payment method</Label>
              <Select value={method || undefined} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="talent-receipt-ref">Reference</Label>
              <Input
                id="talent-receipt-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Wire id, paypal txn, etc."
              />
            </div>
          </div>

          {/* Strategy picker */}
          <div className="grid gap-1.5">
            <Label>Allocate to</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStrategy("fifo")}
                className={cn(
                  "rounded-md border p-3 text-left text-sm transition",
                  strategy === "fifo"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/30",
                )}
              >
                <div className="font-medium text-foreground">Auto · oldest first</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Spreads across unpaid months in chronological order. Use when the
                  creator paid the running balance.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStrategy("specific")}
                className={cn(
                  "rounded-md border p-3 text-left text-sm transition",
                  strategy === "specific"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/30",
                )}
              >
                <div className="font-medium text-foreground">Specific month</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Pick the exact (year, month) this receipt settles. Use when MG
                  cycles or OF billing don't match a calendar month.
                </div>
              </button>
            </div>
          </div>

          {strategy === "specific" && (
            <div className="grid gap-1.5">
              <Label>Target month *</Label>
              <Select value={targetPeriod || undefined} onValueChange={setTargetPeriod}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      outstandingLoading
                        ? "Loading…"
                        : (outstanding ?? []).length === 0
                          ? "No outstanding months"
                          : "Pick a month"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(outstanding ?? []).map((p) => (
                    <SelectItem
                      key={`${p.period_year}-${p.period_month}`}
                      value={`${p.period_year}-${p.period_month}`}
                    >
                      {formatPeriodLabel(p.period_year, p.period_month)} ·{" "}
                      {formatUSD(p.remaining, { decimals: 2 })} remaining
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Outstanding balance panel */}
          {outstanding && outstanding.length > 0 && (
            <div className="rounded-md border bg-muted/15 p-3 text-xs">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-medium text-foreground">
                  Outstanding ({outstanding.length} month{outstanding.length === 1 ? "" : "s"})
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatUSD(totalOutstanding, { decimals: 2 })}
                </span>
              </div>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                {outstanding.slice(0, 12).map((p) => (
                  <li
                    key={`${p.period_year}-${p.period_month}`}
                    className="flex items-center justify-between gap-3 text-muted-foreground"
                  >
                    <span>{formatPeriodLabel(p.period_year, p.period_month)}</span>
                    <span className="tabular-nums">
                      {formatUSD(p.remaining, { decimals: 2 })} of {formatUSD(p.owed, { decimals: 2 })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="talent-receipt-notes">Notes</Label>
            <textarea
              id="talent-receipt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Optional context for this payment."
            />
          </div>

          {pastReceipts && pastReceipts.length > 0 && (
            <div className="rounded-md border bg-muted/15 p-3 text-xs">
              <div className="mb-1.5 font-medium text-foreground">
                {pastReceipts.length} previous receipt{pastReceipts.length === 1 ? "" : "s"}
              </div>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                {pastReceipts.slice(0, 8).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 text-muted-foreground tabular-nums"
                  >
                    <span>{r.received_at}</span>
                    <span className="font-semibold text-foreground">
                      {formatUSD(Number(r.amount), { decimals: 2 })}
                    </span>
                    <span className="truncate text-[11px]">
                      {r.allocations?.length
                        ? r.allocations
                            .map(
                              (a) => `${a.period_year}-${String(a.period_month).padStart(2, "0")}`,
                            )
                            .join(", ")
                        : "unallocated"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Logging…" : "Log payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
