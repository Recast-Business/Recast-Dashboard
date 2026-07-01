import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Wallet } from "lucide-react";
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
import { useHouseRentReceipts } from "@/hooks/usePaymentReceipts";
import {
  useHouseRentPayments,
  useHouseUtilityPayments,
} from "@/hooks/useHouse";
import { useLogHouseCombinedPayment } from "@/hooks/useLogHouseCombinedPayment";
import { useAuth } from "@/auth/AuthProvider";
import type { HouseResident, PaymentMethod } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase M-3: central rent-payment entry on the House page.
 *
 * Replaces the per-resident Pay button. One box, one form: select resident
 * → enter amount + date + method → submit. Server FIFO-allocates against
 * the resident's rent group's oldest unpaid months (the M-2 reconcile
 * trigger handles H&K → group resolution).
 *
 * Right side of the box renders payment history grouped by resident, so
 * Gustavo can review or audit any resident's payments without diving
 * into separate dialogs.
 *
 * Out of scope for M-3a:
 * • Utility reimbursement tracking per-resident (utilities still use
 *   the per-utility Pay button — Recast-pays-bill model).
 * • Recast quarterly rent prepay layer.
 *
 * Both will land as M-3b/c if real use surfaces the need.
 */

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

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  year: number;
  residents: HouseResident[];
}

export function HousePaymentEntryBox({ year, residents }: Props) {
  // R5 follow-up (roles audit): partner can VIEW the receipt
  // history pane on the right but the entry form on the left is
  // hidden — they have no write permission on payment_receipts.
  // RLS at the DB layer is the real guarantee.
  const { role } = useAuth();
  const canWrite = role === "admin" || role === "accounting";

  // R5 follow-up (Gus #5 + #7): the entry box now logs a COMBINED
  // rent + utility payment via useLogHouseCombinedPayment. The old
  // useLogReceiptFifo path is gone; combined logic walks oldest
  // unpaid months and splits proportionally per Gus's spec.
  const log = useLogHouseCombinedPayment();
  const { data: receipts, isLoading } = useHouseRentReceipts(year);
  const { data: rentByGroup } = useHouseRentPayments(year);
  const { data: utilByUtility } = useHouseUtilityPayments(year);

  const today = new Date().toISOString().slice(0, 10);
  const [residentId, setResidentId] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState(today);
  const [method, setMethod] = React.useState<PaymentMethod | "">("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Round-1 efficiency (friction audit #24): after logging, keep the
  // resident + method + date picks — Gus often logs several payments
  // for the same person (or same batch of bank lines) back-to-back,
  // and re-picking everything per entry was click tax. Only the
  // per-payment fields (amount / reference / notes) clear. The
  // explicit "Reset" button still wipes everything.
  function resetAfterLog() {
    setAmount("");
    setReference("");
    setNotes("");
  }

  function reset() {
    setResidentId("");
    setAmount("");
    setReceivedAt(today);
    setMethod("");
    setReference("");
    setNotes("");
  }

  async function onSubmit() {
    if (!residentId) {
      toast.error("Pick who paid.");
      return;
    }
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
      // R5 follow-up (Gus #5): resolve the resident's rent_group, then
      // call the combined-payment hook. The hook walks oldest unpaid
      // months and splits each month's apply across rent + utility
      // proportionally (Gus #7 rounding rule baked in).
      const resident = residents.find((r) => r.id === residentId);
      const rentForResident = resident?.rent_group_id
        ? rentByGroup?.[resident.rent_group_id]
        : undefined;
      const result = await log.mutateAsync({
        resident_id: residentId,
        amount: num,
        received_at: receivedAt,
        method: method || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        residents,
        rentForResident,
        utilByUtility,
        year,
      });
      const tail =
        result.unallocated > 0
          ? ` · ${formatUSD(result.unallocated, { decimals: 2 })} unallocated (no open balance)`
          : "";
      toast.success(
        `${formatUSD(num, { decimals: 2 })} logged${resident ? ` for ${resident.name}` : ""}${tail}`,
      );
      resetAfterLog();
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  // Group receipts by resident for the history pane
  const receiptsByResident = React.useMemo(() => {
    const map: Record<
      string,
      Array<{
        id: string;
        received_at: string;
        amount: number;
        method: PaymentMethod | null;
        reference: string | null;
        notes: string | null;
        allocations: Array<{ period_year: number; period_month: number; amount: number }>;
      }>
    > = {};
    for (const r of (receipts ?? []) as any[]) {
      if (!r.resident_id) continue;
      (map[r.resident_id] ??= []).push({
        id: r.id,
        received_at: r.received_at,
        amount: Number(r.amount) || 0,
        method: r.method,
        reference: r.reference,
        notes: r.notes,
        allocations: (r.allocations ?? []).map((a: any) => ({
          period_year: a.period_year,
          period_month: a.period_month,
          amount: Number(a.amount) || 0,
        })),
      });
    }
    return map;
  }, [receipts]);

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 rounded-lg border bg-card p-4",
        // R5 follow-up (roles audit): single-column layout for
        // partner since the entry form on the left is hidden.
        canWrite && "lg:grid-cols-2",
      )}
    >
      {/* LEFT — entry form (hidden for partner) */}
      {canWrite ? (
      <div className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" /> Log a rent payment
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Enter what was received. The system auto-applies it FIFO across the
            resident's oldest unpaid rent months.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="hpe-resident">Who paid *</Label>
            <Select value={residentId} onValueChange={setResidentId}>
              <SelectTrigger id="hpe-resident">
                <SelectValue placeholder="Pick a resident" />
              </SelectTrigger>
              <SelectContent>
                {residents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="hpe-amount">Amount (USD) *</Label>
            <Input
              id="hpe-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="hpe-date">Received on *</Label>
            <DatePicker
              id="hpe-date"
              value={receivedAt}
              onChange={(v) => setReceivedAt(v ?? "")}
              allowClear={false}
            />
          </div>

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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="hpe-ref">Reference</Label>
            <Input
              id="hpe-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Wire id, check #, …"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hpe-notes">Notes</Label>
            <Input
              id="hpe-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={reset} disabled={log.isPending}>
            Clear
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={log.isPending}>
            {log.isPending ? "Logging…" : "Log payment"}
          </Button>
        </div>
      </div>
      ) : null}

      {/* RIGHT — per-person history */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Payment history — {year}</h3>
          <p className="text-[11px] text-muted-foreground">
            Click a resident to expand their receipts. Allocations show which
            month each payment settled.
          </p>
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border bg-muted/15 p-2">
            {residents.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">No active residents.</div>
            ) : (
              residents.map((r) => (
                <ResidentHistoryRow
                  key={r.id}
                  resident={r}
                  receipts={receiptsByResident[r.id] ?? []}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-resident expandable history row
// ─────────────────────────────────────────────────────────────────────

function ResidentHistoryRow({
  resident,
  receipts,
}: {
  resident: HouseResident;
  receipts: Array<{
    id: string;
    received_at: string;
    amount: number;
    allocations: Array<{ period_year: number; period_month: number; amount: number }>;
    method: PaymentMethod | null;
    reference: string | null;
  }>;
}) {
  const [open, setOpen] = React.useState(false);
  const total = receipts.reduce((s, r) => s + r.amount, 0);
  const hasHistory = receipts.length > 0;

  return (
    <div className={cn("rounded-md", hasHistory && open && "bg-card")}>
      <button
        type="button"
        onClick={() => hasHistory && setOpen((x) => !x)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs",
          hasHistory ? "hover:bg-muted/40" : "cursor-default opacity-70",
        )}
        disabled={!hasHistory}
      >
        <span className="flex items-center gap-1.5">
          {hasHistory ? (
            open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )
          ) : (
            <span className="w-3" />
          )}
          <span className="font-medium">{resident.name}</span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {receipts.length} payment{receipts.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-foreground">
            {formatUSD(total, { decimals: 2 })}
          </span>
        </span>
      </button>

      {open && hasHistory && (
        <ul className="space-y-0.5 px-2 pb-2 text-[11px] text-muted-foreground">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded px-1.5 py-1 hover:bg-muted/30"
              title={r.reference ? `Ref: ${r.reference}` : undefined}
            >
              <span className="tabular-nums">{r.received_at}</span>
              <span className="flex-1 truncate text-[10px]">
                {r.allocations.length > 0
                  ? r.allocations
                      .map(
                        (a) =>
                          `${MONTH_SHORT[a.period_month - 1]} ${formatUSD(a.amount, { decimals: 0 })}`,
                      )
                      .join(", ")
                  : "unallocated"}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatUSD(r.amount, { decimals: 2 })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
