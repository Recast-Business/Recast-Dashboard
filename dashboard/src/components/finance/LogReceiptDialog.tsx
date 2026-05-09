import * as React from "react";
import { toast } from "sonner";
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
  useReceiptsForObligor,
  type ReceiptInput,
} from "@/hooks/usePaymentReceipts";
import type { PaymentMethod } from "@/types/finance";
import { formatUSD } from "@/lib/utils";

/**
 * Log a payment receipt and auto-allocate it FIFO across the obligor's
 * oldest unpaid/partial/overdue periods. Used by House (rent + utilities)
 * and Vendor flows. Talent flows use the sibling component
 * LogReceiptSpecificDialog (K-3c) where the user picks the target month.
 *
 * The actual allocation arithmetic happens server-side in allocate_fifo —
 * this component just collects the inputs and hands the receipt off.
 */

type Mode =
  | {
      kind: "house_rent";
      residentId: string;
      residentName: string;
      monthlyRent: number;
    }
  | {
      kind: "house_utility";
      utilityId: string;
      utilityName: string;
    }
  | {
      kind: "vendor";
      vendorId: string;
      vendorName: string;
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

function modeTitle(mode: Mode): string {
  switch (mode.kind) {
    case "house_rent":
      return `Log rent payment — ${mode.residentName}`;
    case "house_utility":
      return `Log utility payment — ${mode.utilityName}`;
    case "vendor":
      return `Log vendor payment — ${mode.vendorName}`;
  }
}

function modeDescription(mode: Mode): string {
  switch (mode.kind) {
    case "house_rent":
      return `Money lands FIFO against the oldest unpaid month first. Default amount is one month's rent (${formatUSD(mode.monthlyRent, { decimals: 2 })}) — change it if they paid more or less.`;
    case "house_utility":
      return "Money lands FIFO against the oldest unpaid month first. Enter the actual amount that was paid — partials are fine, the trigger marks the cell partial until topped up.";
    case "vendor":
      return "Money lands FIFO against the oldest unpaid month first.";
  }
}

function modeReceiptInput(mode: Mode, base: { received_at: string; amount: number; method: PaymentMethod | null; reference: string | null; notes: string | null }): ReceiptInput {
  switch (mode.kind) {
    case "house_rent":
      return { source: "house_rent", resident_id: mode.residentId, ...base };
    case "house_utility":
      return { source: "house_utility", utility_id: mode.utilityId, ...base };
    case "vendor":
      return { source: "vendor", vendor_id: mode.vendorId, ...base };
  }
}

function modeObligorRef(mode: Mode) {
  switch (mode.kind) {
    case "house_rent":
      return { source: "house_rent" as const, resident_id: mode.residentId };
    case "house_utility":
      return { source: "house_utility" as const, utility_id: mode.utilityId };
    case "vendor":
      return { source: "vendor" as const, vendor_id: mode.vendorId };
  }
}

export function LogReceiptDialog({ open, onOpenChange, mode }: Props) {
  const log = useLogReceiptFifo();
  const { data: pastReceipts } = useReceiptsForObligor(modeObligorRef(mode), open);

  const today = new Date().toISOString().slice(0, 10);
  const defaultAmount =
    mode.kind === "house_rent" ? String(mode.monthlyRent) : "";

  const [receivedAt, setReceivedAt] = React.useState(today);
  const [amount, setAmount] = React.useState(defaultAmount);
  const [method, setMethod] = React.useState<PaymentMethod | "">("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setReceivedAt(today);
    setAmount(defaultAmount);
    setMethod("");
    setReference("");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

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
    try {
      await log.mutateAsync(
        modeReceiptInput(mode, {
          received_at: receivedAt,
          amount: num,
          method: method || null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      );
      toast.success(`${formatUSD(num, { decimals: 2 })} logged`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const totalPaid = (pastReceipts ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            {modeTitle(mode)}
          </DialogTitle>
          <DialogDescription>{modeDescription(mode)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="receipt-date">Received on *</Label>
              <DatePicker
                id="receipt-date"
                value={receivedAt}
                onChange={(v) => setReceivedAt(v ?? "")}
                allowClear={false}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="receipt-amount">Amount (USD) *</Label>
              <Input
                id="receipt-amount"
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
              <Label htmlFor="receipt-ref">Reference</Label>
              <Input
                id="receipt-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Wire id, check #, etc."
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="receipt-notes">Notes</Label>
            <textarea
              id="receipt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Anything Gustavo or Frazier should remember about this payment."
            />
          </div>

          {pastReceipts && pastReceipts.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-3 text-xs">
              <div className="mb-1.5 font-medium">
                {pastReceipts.length} previous receipt{pastReceipts.length === 1 ? "" : "s"} ·{" "}
                <span className="tabular-nums">{formatUSD(totalPaid, { decimals: 2 })}</span> total
              </div>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                {pastReceipts.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 tabular-nums">
                    <span className="text-muted-foreground">{r.received_at}</span>
                    <span className="font-semibold">
                      {formatUSD(Number(r.amount), { decimals: 2 })}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {r.allocations?.length
                        ? r.allocations
                            .map((a) => `${a.period_year}-${String(a.period_month).padStart(2, "0")}`)
                            .join(", ")
                        : "unallocated"}
                    </span>
                  </li>
                ))}
              </ul>
              {pastReceipts.length > 8 && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Showing 8 most recent. Full history in the receipts panel (K-3c).
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={log.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={log.isPending}>
            {log.isPending ? "Logging…" : "Log payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
