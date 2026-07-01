import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { useVendors } from "@/hooks/useVendors";
import { useTeleDeals } from "@/hooks/useTeleDeals";
import { useOFDeals } from "@/hooks/useOFDeals";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCampaignCreators } from "@/hooks/useCampaignCreators";
import { useHouseResidents, useHouseUtilities } from "@/hooks/useHouse";
import {
  useLogReceiptFifo,
  useLogReceiptSpecific,
  type ReceiptInput,
} from "@/hooks/usePaymentReceipts";
import type { PaymentMethod, PaymentSource } from "@/types/finance";
import { formatUSD } from "@/lib/utils";

/**
 * R5 Sweep 5 — Global "log payment" dialog.
 *
 * Lets the user record a payment_receipts row without first navigating
 * to a specific obligor's page. Source picker at the top reveals a
 * conditional obligor selector per source, then the common fields
 * (amount / date / method / reference / notes), then allocation mode:
 *
 *   • FIFO (default) — server allocates the receipt oldest-first
 *     across the obligor's unpaid / partial / overdue periods. Uses
 *     allocate_fifo RPC.
 *
 *   • Specific — user enters explicit (year, month, amount) splits.
 *     Amounts must sum to the receipt total. Uses allocate_specific
 *     RPC (called once per split inside useLogReceiptSpecific).
 *
 * This is the bigger sibling of the existing per-context dialogs
 * (LogReceiptDialog, TalentReceiptDialog, HousePaymentEntryBox)
 * which all assume the obligor is already known. Same RPCs under the
 * hood; just a different entry surface for the /payments page.
 */

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "paypal", label: "PayPal" },
  { value: "domestic_wire", label: "Domestic Wire" },
  { value: "international_transfer", label: "Int'l Transfer" },
  { value: "bank_ach", label: "Bank ACH" },
  { value: "zelle", label: "Zelle" },
  { value: "invoice_link", label: "Invoice Link" },
  { value: "website_link", label: "Website Link" },
  { value: "credit_card", label: "Credit Card" },
];

const SOURCE_OPTIONS: { value: PaymentSource; label: string; hint: string }[] = [
  { value: "vendor", label: "Vendor", hint: "Adobe, Restream, etc." },
  { value: "campaign", label: "Campaign", hint: "Brand deal payout to a creator" },
  { value: "telegram", label: "Telegram", hint: "Tele deal payout" },
  { value: "onlyfans", label: "OnlyFans", hint: "OF page payout" },
  { value: "house_rent", label: "House rent", hint: "Resident rent payment" },
  { value: "house_utility", label: "Utility", hint: "Bill paid by Recast" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface AllocRow {
  period_year: number;
  period_month: number;
  amount: string; // string so the input can be empty during editing
}

export function LogPaymentDialog({ open, onOpenChange }: Props) {
  const [source, setSource] = React.useState<PaymentSource | "">("");
  const [obligorId, setObligorId] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = React.useState<PaymentMethod | "">("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [allocMode, setAllocMode] = React.useState<"fifo" | "specific">("fifo");
  const [allocRows, setAllocRows] = React.useState<AllocRow[]>([]);

  const fifo = useLogReceiptFifo();
  const specific = useLogReceiptSpecific();
  const submitting = fifo.isPending || specific.isPending;

  // Reset state every time the dialog opens — leftover state from a
  // previous open would be confusing across different payees.
  //
  // Round-1 efficiency (friction audit #4): source + method DO carry
  // over from the last successful log this session. Gus batch-enters
  // receipts of the same kind back-to-back, and re-picking "Vendor"
  // + "Bank transfer" on every single one was pure click tax. The
  // payee/amount/reference still reset — those genuinely differ per
  // receipt.
  React.useEffect(() => {
    if (!open) return;
    setSource(
      (sessionStorage.getItem("recast.lastPaymentSource") as PaymentSource | null) ?? "",
    );
    setObligorId("");
    setAmount("");
    setReceivedAt(new Date().toISOString().slice(0, 10));
    setMethod(
      (sessionStorage.getItem("recast.lastPaymentMethod") as PaymentMethod | null) ?? "",
    );
    setReference("");
    setNotes("");
    setAllocMode("fifo");
    setAllocRows([]);
  }, [open]);

  // Reset the obligor when the source changes — picking "Vendor" then
  // flipping to "House rent" must not carry the vendor id across.
  React.useEffect(() => {
    setObligorId("");
  }, [source]);

  async function onSubmit() {
    if (!source) {
      toast.error("Pick a source first.");
      return;
    }
    if (!obligorId) {
      toast.error("Pick who the payment is for.");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    if (!receivedAt) {
      toast.error("Pick a date for when the money moved.");
      return;
    }

    // Build the polymorphic obligor ref. The discriminated-union shape
    // of ReceiptInput keeps this type-safe at the call site.
    const base = {
      received_at: receivedAt,
      amount: amt,
      method: method || null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    };
    let input: ReceiptInput;
    switch (source) {
      case "vendor":
        input = { ...base, source, vendor_id: obligorId };
        break;
      case "campaign":
        input = { ...base, source, campaign_creator_id: obligorId };
        break;
      case "telegram":
        input = { ...base, source, creator_id: obligorId };
        break;
      case "onlyfans":
        input = { ...base, source, of_deal_id: obligorId };
        break;
      case "house_rent":
        input = { ...base, source, resident_id: obligorId };
        break;
      case "house_utility":
        input = { ...base, source, utility_id: obligorId };
        break;
    }

    try {
      if (allocMode === "fifo") {
        await fifo.mutateAsync(input);
        toast.success(`Logged ${formatUSD(amt, { decimals: 2 })} · auto-allocated`);
      } else {
        // Validate specific allocations sum to the receipt total before
        // we ship anything — the server RPC would also reject mismatch
        // but a client-side check spares a round-trip.
        const allocs = allocRows
          .map((a) => ({
            period_year: a.period_year,
            period_month: a.period_month,
            amount: Number(a.amount) || 0,
          }))
          .filter((a) => a.amount > 0);
        if (allocs.length === 0) {
          toast.error("Specific mode needs at least one allocation row.");
          return;
        }
        const allocTotal = allocs.reduce((s, a) => s + a.amount, 0);
        if (Math.abs(allocTotal - amt) > 0.01) {
          toast.error(
            `Allocations sum to ${formatUSD(allocTotal, { decimals: 2 })}, ` +
              `receipt is ${formatUSD(amt, { decimals: 2 })}.`,
          );
          return;
        }
        await specific.mutateAsync({ receipt: input, allocations: allocs });
        toast.success(
          `Logged ${formatUSD(amt, { decimals: 2 })} · ${allocs.length} ` +
            `allocation${allocs.length === 1 ? "" : "s"}`,
        );
      }
      // Remember the kind of receipt just logged so the next open
      // starts pre-picked for batch entry (session-scoped).
      try {
        sessionStorage.setItem("recast.lastPaymentSource", source);
        if (method) sessionStorage.setItem("recast.lastPaymentMethod", method);
      } catch {
        /* best-effort */
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Log payment failed: ${(e as Error).message}`);
    }
  }

  function addAllocRow() {
    const today = new Date();
    setAllocRows((rows) => [
      ...rows,
      {
        period_year: today.getFullYear(),
        period_month: today.getMonth() + 1,
        amount: "",
      },
    ]);
  }
  function updateAllocRow(i: number, patch: Partial<AllocRow>) {
    setAllocRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeAllocRow(i: number) {
    setAllocRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  // Live allocation total for the "splits sum to" helper line.
  const allocSum = allocRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const amtNum = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log payment</DialogTitle>
          <DialogDescription>
            Record a payment_receipts row across any source. The server
            allocates it oldest-first by default, or you can split it
            across specific months.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* ── Source ─────────────────────────────────────────────── */}
          <div className="grid gap-1.5">
            <Label htmlFor="lp-source">Source *</Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as PaymentSource)}
            >
              <SelectTrigger id="lp-source">
                <SelectValue placeholder="Pick a source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      — {s.hint}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Obligor (conditional) ─────────────────────────────── */}
          {source ? (
            <ObligorPicker
              source={source}
              value={obligorId}
              onChange={setObligorId}
            />
          ) : null}

          {/* ── Amount + date ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lp-amount">Amount (USD) *</Label>
              <Input
                id="lp-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lp-date">Received *</Label>
              <Input
                id="lp-date"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
          </div>

          {/* ── Method + reference ───────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lp-method">Method</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod((v as PaymentMethod) || "")}
              >
                <SelectTrigger id="lp-method">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lp-ref">Reference</Label>
              <Input
                id="lp-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Wire id / check # / PayPal txn"
              />
            </div>
          </div>

          {/* ── Notes ─────────────────────────────────────────────── */}
          <div className="grid gap-1.5">
            <Label htmlFor="lp-notes">Notes</Label>
            <textarea
              id="lp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* ── Allocation mode ──────────────────────────────────── */}
          <div className="rounded-md border bg-muted/15 p-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Allocation
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="lp-alloc-mode"
                  checked={allocMode === "fifo"}
                  onChange={() => setAllocMode("fifo")}
                />
                FIFO (auto, oldest unpaid first)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="lp-alloc-mode"
                  checked={allocMode === "specific"}
                  onChange={() => setAllocMode("specific")}
                />
                Specific months
              </label>
            </div>

            {allocMode === "specific" ? (
              <div className="space-y-2 border-t border-rule pt-2">
                {allocRows.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    No allocations yet. Click "+ Add allocation" to split
                    the receipt across specific months.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {allocRows.map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[110px_110px_1fr_auto] items-center gap-2"
                      >
                        <Input
                          type="number"
                          min="2020"
                          max="2099"
                          value={row.period_year}
                          onChange={(e) =>
                            updateAllocRow(i, {
                              period_year: Number(e.target.value) || row.period_year,
                            })
                          }
                          className="h-8 text-[12px]"
                          placeholder="Year"
                        />
                        <Select
                          value={String(row.period_month)}
                          onValueChange={(v) =>
                            updateAllocRow(i, { period_month: Number(v) })
                          }
                        >
                          <SelectTrigger className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((m, idx) => (
                              <SelectItem key={idx + 1} value={String(idx + 1)}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) =>
                            updateAllocRow(i, { amount: e.target.value })
                          }
                          className="h-8 text-[12px]"
                          placeholder="Amount"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAllocRow(i)}
                          aria-label="Remove allocation"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAllocRow}
                  className="h-8 text-[12px]"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                  Add allocation
                </Button>
                {allocRows.length > 0 ? (
                  <p
                    className={
                      Math.abs(allocSum - amtNum) > 0.01
                        ? "text-[11px] text-destructive"
                        : "text-[11px] text-muted-foreground"
                    }
                  >
                    Splits sum to {formatUSD(allocSum, { decimals: 2 })} ·
                    Receipt is {formatUSD(amtNum, { decimals: 2 })}
                    {Math.abs(allocSum - amtNum) > 0.01
                      ? " — must match to save"
                      : " ✓"}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? "Logging…" : "Log payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─────────────────────────────────────────────────────────────────────
// Obligor picker — conditional per source
// ─────────────────────────────────────────────────────────────────────

function ObligorPicker({
  source,
  value,
  onChange,
}: {
  source: PaymentSource;
  value: string;
  onChange: (id: string) => void;
}) {
  if (source === "vendor") return <VendorPicker value={value} onChange={onChange} />;
  if (source === "campaign") return <CampaignCreatorPicker value={value} onChange={onChange} />;
  if (source === "telegram") return <TelegramPicker value={value} onChange={onChange} />;
  if (source === "onlyfans") return <OFDealPicker value={value} onChange={onChange} />;
  if (source === "house_rent") return <ResidentPicker value={value} onChange={onChange} />;
  if (source === "house_utility") return <UtilityPicker value={value} onChange={onChange} />;
  return null;
}

function VendorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: vendors } = useVendors({ kind: "vendor" });
  return (
    <PickerSelect
      label="Vendor *"
      placeholder="Pick a vendor"
      value={value}
      onChange={onChange}
      options={(vendors ?? []).map((v) => ({ id: v.id, label: v.name }))}
    />
  );
}

function TelegramPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  // Telegram receipts attach to creator_id directly (one deal per
  // creator). Pull active tele deals → distinct creators.
  const { data: deals } = useTeleDeals();
  const options = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const d of deals ?? []) {
      const cid = d.creator?.id;
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      out.push({ id: cid, label: d.creator?.name ?? "(no name)" });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [deals]);
  return (
    <PickerSelect
      label="Creator (Telegram) *"
      placeholder="Pick a creator"
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

function OFDealPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: deals } = useOFDeals();
  const options = React.useMemo(
    () =>
      (deals ?? []).map((d) => ({
        id: d.id,
        label: `${d.creator?.name ?? "(no name)"} · ${d.page_name}`,
      })),
    [deals],
  );
  return (
    <PickerSelect
      label="OnlyFans deal *"
      placeholder="Pick an OF deal"
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

function CampaignCreatorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: campaigns } = useCampaigns();
  const [campaignId, setCampaignId] = React.useState<string>("");
  const { data: ccs } = useCampaignCreators(campaignId || null);
  return (
    <div className="space-y-2">
      <PickerSelect
        label="Campaign *"
        placeholder="Pick a campaign"
        value={campaignId}
        onChange={(id) => {
          setCampaignId(id);
          onChange(""); // reset downstream picker
        }}
        options={(campaigns ?? []).map((c) => ({
          id: c.id,
          label: c.brand ? `${c.brand} · ${c.name}` : c.name,
        }))}
      />
      {campaignId ? (
        <PickerSelect
          label="Creator on this campaign *"
          placeholder="Pick a creator"
          value={value}
          onChange={onChange}
          options={(ccs ?? []).map((cc) => ({
            id: cc.id,
            label: cc.creator?.name ?? "(no name)",
          }))}
        />
      ) : null}
    </div>
  );
}

function ResidentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: residents } = useHouseResidents();
  return (
    <PickerSelect
      label="Resident *"
      placeholder="Pick a resident"
      value={value}
      onChange={onChange}
      options={(residents ?? []).map((r) => ({ id: r.id, label: r.name }))}
    />
  );
}

function UtilityPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: utilities } = useHouseUtilities();
  return (
    <PickerSelect
      label="Utility *"
      placeholder="Pick a utility"
      value={value}
      onChange={onChange}
      options={(utilities ?? []).map((u) => ({ id: u.id, label: u.utility_name }))}
    />
  );
}

function PickerSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No options available.
            </div>
          ) : (
            options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
